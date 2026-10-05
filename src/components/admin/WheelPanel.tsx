import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Car, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  DEFAULT_SEGMENTS,
  useCasinoAdmin,
  type PodiumVehicleConfig,
  type RewardType,
  type WheelSegmentConfig,
} from '../../context/CasinoAdminContext';
import { vehicleDisplayName } from '../../lib/rewards';
import { lotChances, lotValue, usePackSets, wheelExpected, wheelRtp, type PackSet, type WheelValueContext } from '../../lib/wheelEconomy';
import { Wheel } from '../wheel/Wheel';
import { VehiclePicker } from './VehiclePicker';
import { Badge, Button, Card, Field, Modal, NumberInput, PageHeader, SaveBar, cx, fmt, inputClass } from './ui';

const TYPE_LABEL: Record<RewardType, string> = {
  chips: 'Jetons',
  vehicle: 'Véhicule',
  vip: 'Carte VIP',
  pack: 'Booster de collection',
  voucher: 'Bonus offert (machine)',
  mystery: 'Objet mystère',
  clothing: 'Vêtement',
};

const TYPE_ICON: Record<RewardType, string> = { chips: '🪙', vehicle: '🏎️', vip: '💎', pack: '🃏', voucher: '🎰', mystery: '🎁', clothing: '👔' };

const MIN_LOTS = 2;
const MAX_LOTS = 24;

/** Ce que le joueur reçoit, en une ligne */
function describeLot(s: WheelSegmentConfig, packSets: PackSet[], vipDays: number): string {
  switch (s.type) {
    case 'chips':
      return `${fmt(Number(s.value))} jetons`;
    case 'vehicle':
      return s.vehicleModel ? String(s.value) : `${String(s.value)} · aucun véhicule du catalogue lié`;
    case 'vip':
      return `Carte ${s.vipTier ?? 'SILVER'} · ${vipDays} jours`;
    case 'pack':
      return `Booster ${packSets.find((p) => p.id === s.packSet)?.name ?? 'Collection'}`;
    case 'voucher':
      return `Bonus ${s.voucherGame === 'wanted' ? 'Wanted' : 'Dog House'} offert`;
    default:
      return String(s.value);
  }
}

export const WheelPanel: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const { segments, vipConfig, podiumVehicle, gamesConfig, saveGamesConfig, saveSegments, savePodiumVehicle } = useCasinoAdmin();
  const packSets = usePackSets();
  const ctx: WheelValueContext = { packSets, vipConfig };

  // Un seul brouillon pour les lots et les réglages, un seul bouton « Enregistrer »
  const [lots, setLots] = useState<WheelSegmentConfig[]>(segments);
  const [price, setPrice] = useState(gamesConfig.wheel.spinPrice);
  const [maxRtp, setMaxRtp] = useState(gamesConfig.wheel.maxRtp);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ index: number; seg: WheelSegmentConfig } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => setLots(segments), [segments]);
  useEffect(() => setPrice(gamesConfig.wheel.spinPrice), [gamesConfig.wheel.spinPrice]);
  useEffect(() => setMaxRtp(gamesConfig.wheel.maxRtp), [gamesConfig.wheel.maxRtp]);

  const lotsDirty = JSON.stringify(lots) !== JSON.stringify(segments);
  const cfgDirty = price !== gamesConfig.wheel.spinPrice || maxRtp !== gamesConfig.wheel.maxRtp;
  const dirty = lotsDirty || cfgDirty;

  const chances = useMemo(() => lotChances(lots), [lots]);
  const maxChance = Math.max(...chances, 0.0001);
  const expected = wheelExpected(lots, ctx);
  const rtp = wheelRtp(lots, price, ctx);
  const losing = rtp > maxRtp;
  const unpricedChance = lots.reduce((a, s, i) => a + (lotValue(s, ctx) === null ? chances[i] : 0), 0);
  // Coût moyen de chaque lot pour le casino, par tour : repère les lots qui mangent la marge
  const costs = lots.map((s, i) => (lotValue(s, ctx) ?? 0) * (chances[i] / 100));
  const costliest = costs.reduce((best, c, i) => (c > (costs[best] ?? -1) ? i : best), 0);

  const reset = () => {
    setLots(segments);
    setPrice(gamesConfig.wheel.spinPrice);
    setMaxRtp(gamesConfig.wheel.maxRtp);
  };

  const save = async () => {
    setSaving(true);
    const nextCfg = { ...gamesConfig, wheel: { ...gamesConfig.wheel, spinPrice: price, maxRtp } };
    const nextLots = lots.map((s, i) => ({ ...s, id: i }));
    // Le serveur vérifie la rentabilité à chaque enregistrement : on commence par l'étape
    // qui laisse la roue gagnante avec l'ancien réglage de l'autre partie
    const cfgFirst = !lotsDirty || wheelRtp(segments, price, ctx) <= maxRtp;
    let ok = true;
    if (cfgFirst) {
      if (cfgDirty) ok = await saveGamesConfig(nextCfg);
      if (ok && lotsDirty) ok = await saveSegments(nextLots);
    } else {
      ok = await saveSegments(nextLots);
      if (ok && cfgDirty) ok = await saveGamesConfig(nextCfg);
    }
    setSaving(false);
    if (ok) showToast('Roue enregistrée : appliquée dès le prochain tour.');
  };

  const update = (i: number, patch: Partial<WheelSegmentConfig>) => setLots(lots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lots.length) return;
    const next = [...lots];
    [next[i], next[j]] = [next[j], next[i]];
    setLots(next);
  };

  const newLot = (): WheelSegmentConfig => ({
    id: lots.length,
    label: '10 000 JETONS',
    type: 'chips',
    value: 10000,
    color: '#171717',
    textColor: '#ffffff',
    icon: '🪙',
    dropRate: 1,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roue de la Fortune"
        subtitle="Le joueur paie un tour et gagne l'un des lots. Réglez le prix, les lots et leurs chances, puis enregistrez."
        actions={
          <Badge tone={gamesConfig.wheel.enabled ? 'good' : 'bad'}>{gamesConfig.wheel.enabled ? 'Roue ouverte' : 'Roue fermée (onglet Machines)'}</Badge>
        }
      />

      <div className="sticky top-0 z-20 flex flex-col gap-2 empty:hidden">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={reset} blocked={losing || price < 1} />
        {dirty && losing && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-200">
            Enregistrement bloqué : la roue rendrait {fmt(rtp, 1)} % du prix du tour (maximum {fmt(maxRtp)} %).
          </div>
        )}
      </div>

      {/* 1. Rentabilité + aperçu */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <Card title="Prix et rentabilité">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Prix d'un tour" hint="Débité par le serveur à chaque tour, sans limite par jour.">
                <NumberInput value={price} min={1} onChange={(v) => setPrice(Math.max(0, v))} suffix="⛁" />
              </Field>
              <Field label="Retour joueur maximum" hint="Garde-fou : au-dessus, le serveur refuse le réglage.">
                <NumberInput value={maxRtp} min={10} max={98} onChange={(v) => setMaxRtp(Math.min(98, Math.max(10, v)))} suffix="%" />
              </Field>
            </div>

            <RtpGauge rtp={rtp} max={maxRtp} />

            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Rendu au joueur / tour" value={`${fmt(expected)} ⛁`} />
              <MiniStat label="Gardé par le casino / tour" value={`${fmt(Math.max(0, price - expected))} ⛁`} tone={losing ? 'bad' : 'good'} />
              <MiniStat label="Lots non chiffrés" value={`${fmt(unpricedChance, 1)} %`} hint="objets, vêtements" />
            </div>

            {losing && lots.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-200">
                <AlertTriangle size={14} className="shrink-0 mt-px" />
                <span>
                  La roue fait perdre le casino. Le lot qui coûte le plus est <b>{lots[costliest]?.label}</b> ({fmt(costs[costliest])} ⛁ par tour en moyenne) :
                  baissez son poids, ou montez le prix du tour.
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Aperçu joueur">
          <div className="flex flex-col items-center gap-3">
            <div className="w-full max-w-[260px] aspect-square">
              <Wheel segments={lots} highlightIndex={hovered} className="w-full h-full" />
            </div>
            <p className="text-[11px] text-neutral-500 text-center">Modifications non enregistrées comprises. Survolez un lot pour le repérer.</p>
          </div>
        </Card>
      </div>

      {/* 2. Lots */}
      <Card
        title={`Lots (${lots.length})`}
        padded={false}
        right={
          <Button size="sm" disabled={lots.length >= MAX_LOTS} onClick={() => setEditing({ index: -1, seg: newLot() })}>
            <Plus size={12} /> Ajouter un lot
          </Button>
        }
      >
        <div className="hidden md:grid grid-cols-[2rem_1fr_7rem_9rem_7rem_8.5rem] gap-3 px-5 py-2.5 text-[11px] text-neutral-500 border-b border-white/10">
          <span>#</span>
          <span>Lot</span>
          <span>Poids</span>
          <span>Chance</span>
          <span className="text-right" title="Valeur du lot × sa chance : ce que ce lot coûte au casino en moyenne à chaque tour">
            Coût moyen / tour
          </span>
          <span />
        </div>
        <ul className="divide-y divide-white/5">
          {lots.map((seg, i) => (
            <li
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_7rem_9rem_7rem_8.5rem] items-center gap-3 px-5 py-3 hover:bg-white/[0.02]"
            >
              <span className="font-mono text-xs text-neutral-500">{i + 1}</span>

              <button type="button" onClick={() => setEditing({ index: i, seg })} className="flex items-center gap-3 min-w-0 text-left cursor-pointer group">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 border border-white/10" style={{ backgroundColor: seg.color }}>
                  {seg.icon || TYPE_ICON[seg.type]}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-white truncate group-hover:underline">{seg.label}</span>
                  <span className={cx('block text-[11px] truncate', seg.type === 'vehicle' && !seg.vehicleModel ? 'text-rose-300' : 'text-neutral-500')}>
                    {TYPE_LABEL[seg.type]} · {describeLot(seg, packSets, vipConfig.durationDays)}
                  </span>
                </span>
              </button>

              <div className="hidden md:block">
                <NumberInput value={seg.dropRate} min={0} step={0.5} onChange={(v) => update(i, { dropRate: Math.max(0, v) })} />
              </div>

              <div className="hidden md:flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-white" style={{ width: `${(chances[i] / maxChance) * 100}%` }} />
                </div>
                <span className="font-mono text-xs text-white w-12 text-right">{fmt(chances[i], chances[i] < 1 ? 2 : 1)} %</span>
              </div>

              <span
                className="hidden md:block text-right font-mono text-xs text-neutral-300"
                title={lotValue(seg, ctx) === null ? 'Objet sans valeur en jetons : non compté' : `${fmt(lotValue(seg, ctx))} × ${fmt(chances[i], 2)} %`}
              >
                {lotValue(seg, ctx) === null ? <span className="text-neutral-600">non chiffré</span> : `${fmt(costs[i])} ⛁`}
              </span>

              <div className="flex justify-end gap-0.5">
                <span className="md:hidden font-mono text-xs text-white self-center mr-2">{fmt(chances[i], 1)} %</span>
                <Button size="sm" variant="subtle" onClick={() => move(i, -1)} disabled={i === 0} title="Monter" aria-label="Monter">
                  <ArrowUp size={12} />
                </Button>
                <Button size="sm" variant="subtle" onClick={() => move(i, 1)} disabled={i === lots.length - 1} title="Descendre" aria-label="Descendre">
                  <ArrowDown size={12} />
                </Button>
                <Button size="sm" variant="subtle" onClick={() => setEditing({ index: i, seg })} title="Modifier" aria-label="Modifier">
                  <Pencil size={12} />
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  className="hover:!text-rose-300"
                  disabled={lots.length <= MIN_LOTS}
                  onClick={() => setLots(lots.filter((_, j) => j !== i))}
                  title="Supprimer"
                  aria-label="Supprimer"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-neutral-500">
          <span>
            Chance d'un lot = son poids ÷ la somme des poids ({fmt(lots.reduce((a, s) => a + Math.max(0, s.dropRate), 0), 2)}). Un poids de 0 ne sort jamais.
            L'ordre de la liste est l'ordre sur la roue.
            <br />
            Coût moyen = valeur du lot × sa chance. Additionnés, ils donnent le « Rendu au joueur / tour » : le plus gros coût est le lot qui pèse le
            plus sur la marge.
          </span>
          <Button
            size="sm"
            variant="subtle"
            onClick={() => window.confirm('Remplacer tous les lots par les lots par défaut ? (rien n\'est enregistré tant que vous ne cliquez pas sur Enregistrer)') && setLots(DEFAULT_SEGMENTS)}
          >
            <RotateCcw size={12} /> Lots par défaut
          </Button>
        </div>
      </Card>

      {/* 3. Véhicule du podium */}
      <PodiumCard podium={podiumVehicle} locked={lotsDirty} onSave={async (p) => (await savePodiumVehicle(p)) && showToast(`Podium : ${p.name}`)} />

      {editing && (
        <SegmentEditor
          seg={editing.seg}
          isNew={editing.index < 0}
          packSets={packSets}
          podium={podiumVehicle}
          otherWeight={lots.reduce((a, s, j) => a + (j === editing.index ? 0 : Math.max(0, s.dropRate)), 0)}
          onClose={() => setEditing(null)}
          onApply={(seg) => {
            setLots(editing.index < 0 ? [...lots, seg] : lots.map((s, j) => (j === editing.index ? seg : s)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const MiniStat: React.FC<{ label: string; value: string; hint?: string; tone?: 'good' | 'bad' }> = ({ label, value, hint, tone }) => (
  <div className="rounded-xl bg-white/[0.03] border border-white/10 px-2 py-2.5 min-w-0">
    <div className="text-[10px] text-neutral-500 leading-tight">{label}</div>
    <div className={cx('font-mono text-sm mt-1 truncate', tone === 'bad' ? 'text-rose-400' : tone === 'good' ? 'text-emerald-300' : 'text-white')}>{value}</div>
    {hint && <div className="text-[10px] text-neutral-600">{hint}</div>}
  </div>
);

/** Jauge du retour joueur, avec le maximum autorisé marqué d'un trait */
const RtpGauge: React.FC<{ rtp: number; max: number }> = ({ rtp, max }) => {
  const scale = Math.max(100, rtp * 1.05);
  const losing = rtp > max;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-medium text-neutral-400">Retour joueur</span>
        <span className={cx('font-mono text-2xl font-bold', losing ? 'text-rose-400' : 'text-white')}>{fmt(rtp, 1)} %</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/10">
        <div className={cx('h-full rounded-full transition-all', losing ? 'bg-rose-500' : 'bg-emerald-400')} style={{ width: `${Math.min(100, (rtp / scale) * 100)}%` }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-white" style={{ left: `${(max / scale) * 100}%` }} title={`Maximum ${max} %`} />
      </div>
      <div className="mt-1.5 text-[11px] text-neutral-500">
        {losing ? 'Au-dessus du maximum : la roue sera refusée par le serveur.' : `Sur 100 jetons payés, le joueur en récupère ${fmt(rtp)} en moyenne (maximum ${fmt(max)}).`}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const PodiumCard: React.FC<{ podium: PodiumVehicleConfig; locked: boolean; onSave: (p: PodiumVehicleConfig) => Promise<unknown> }> = ({ podium, locked, onSave }) => {
  const [draft, setDraft] = useState(podium);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(podium), [podium]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(podium);

  return (
    <Card title="Véhicule du podium" icon={<Car size={15} />}>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
        <div className="flex flex-col gap-2">
          <img src={draft.imageUrl || '/podium_supercar.jpg'} alt="" className="w-full aspect-video object-cover rounded-xl border border-white/10 bg-black" />
          <div className="text-[13px] font-semibold text-white truncate">{draft.name}</div>
          <div className="text-[11px] font-mono text-neutral-400">{fmt(draft.value)} $</div>
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          <p className="text-[12px] text-neutral-400">
            Affiché en vedette sur la page de la roue. Les lots « véhicule » liés à l'ancien podium passent automatiquement sur le nouveau.
          </p>
          <VehiclePicker
            selectedModel={draft.model}
            className="max-h-44"
            onSelect={(v) =>
              setDraft({
                name: vehicleDisplayName(v.manufacturer, v.model),
                model: v.model,
                value: v.price || 0,
                imageUrl: v.photo_full_url || v.photo_url || '/podium_supercar.jpg',
              })
            }
          />
          <div className="flex items-center justify-end gap-3">
            {locked && dirty && <span className="text-[11px] text-neutral-500">Enregistrez d'abord les lots de la roue.</span>}
            {dirty && (
              <Button variant="subtle" onClick={() => setDraft(podium)} disabled={saving}>
                Annuler
              </Button>
            )}
            <Button
              variant="primary"
              loading={saving}
              disabled={!dirty || locked}
              onClick={async () => {
                setSaving(true);
                await onSave(draft);
                setSaving(false);
              }}
            >
              Changer le podium
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------

const selectClass = cx(inputClass, 'cursor-pointer');

const SegmentEditor: React.FC<{
  seg: WheelSegmentConfig;
  isNew: boolean;
  packSets: PackSet[];
  podium: PodiumVehicleConfig;
  /** Somme des poids des autres lots, pour afficher la chance obtenue */
  otherWeight: number;
  onClose: () => void;
  onApply: (s: WheelSegmentConfig) => void;
}> = ({ seg: initial, isNew, packSets, podium, otherWeight, onClose, onApply }) => {
  const [seg, setSeg] = useState(initial);
  const total = otherWeight + Math.max(0, seg.dropRate);
  const chance = total > 0 ? (Math.max(0, seg.dropRate) / total) * 100 : 0;

  const changeType = (type: RewardType) =>
    setSeg({
      ...seg,
      type,
      icon: TYPE_ICON[type],
      value: type === 'chips' ? Number(seg.value) || 10000 : typeof seg.value === 'number' ? '' : seg.value,
      vehicleModel: type === 'vehicle' ? seg.vehicleModel : undefined,
      vehicleValue: type === 'vehicle' ? seg.vehicleValue : undefined,
      imageUrl: type === 'vehicle' ? seg.imageUrl : undefined,
      voucherGame: type === 'voucher' ? seg.voucherGame ?? 'doghouse' : undefined,
      voucherBuy: type === 'voucher' ? seg.voucherBuy ?? 'buy' : undefined,
      voucherValue: type === 'voucher' ? seg.voucherValue ?? 20000 : undefined,
      packSet: type === 'pack' ? seg.packSet ?? packSets[0]?.id : undefined,
      vipTier: type === 'vip' ? seg.vipTier ?? 'SILVER' : undefined,
    });

  const missingVehicle = seg.type === 'vehicle' && !seg.vehicleModel;
  const invalid = !seg.label.trim() || missingVehicle || (seg.type !== 'chips' && seg.type !== 'vip' && seg.type !== 'pack' && seg.type !== 'voucher' && !String(seg.value).trim());

  return (
    <Modal title={isNew ? 'Nouveau lot' : 'Modifier le lot'} onClose={onClose} width="max-w-xl">
      <div className="flex flex-col gap-5">
        {/* Type */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {(Object.keys(TYPE_LABEL) as RewardType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => t !== seg.type && changeType(t)}
              className={cx(
                'flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-semibold leading-tight cursor-pointer transition-colors',
                seg.type === t ? 'bg-white text-black border-white' : 'border-white/10 text-neutral-400 hover:text-white hover:bg-white/5',
              )}
            >
              <span className="text-base">{TYPE_ICON[t]}</span>
              {TYPE_LABEL[t].split(' (')[0]}
            </button>
          ))}
        </div>

        {/* Gain */}
        {seg.type === 'chips' && (
          <Field label="Jetons gagnés">
            <NumberInput
              value={Number(seg.value) || 0}
              min={0}
              onChange={(v) => {
                const value = Math.max(0, v);
                // Le nom suit le montant tant qu'il n'a pas été personnalisé
                const auto = (n: unknown) => `${fmt(Number(n))}JETONS`.replace(/\s/g, '');
                const label = seg.label.replace(/\s/g, '') === auto(seg.value) ? `${fmt(value).replace(/\s/g, ' ')} JETONS` : seg.label;
                setSeg({ ...seg, value, label });
              }}
              suffix="⛁"
            />
          </Field>
        )}

        {seg.type === 'vehicle' && (
          <Field label={seg.vehicleModel ? `Véhicule : ${seg.value} · ${fmt(seg.vehicleValue)} $` : 'Véhicule du catalogue'} hint="Livré en ville après réclamation. Compte dans la rentabilité à sa valeur catalogue.">
            <div className="flex flex-col gap-2">
              {podium.model && podium.model !== seg.vehicleModel && (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => setSeg({ ...seg, value: podium.name, vehicleModel: podium.model, vehicleValue: podium.value, imageUrl: podium.imageUrl })}
                >
                  <Car size={12} /> Utiliser le véhicule du podium ({podium.name})
                </Button>
              )}
              <VehiclePicker
                selectedModel={seg.vehicleModel}
                className="max-h-48"
                onSelect={(v) =>
                  setSeg({
                    ...seg,
                    value: vehicleDisplayName(v.manufacturer, v.model),
                    vehicleModel: v.model,
                    vehicleValue: v.price || 0,
                    imageUrl: v.photo_full_url || v.photo_url || undefined,
                  })
                }
              />
            </div>
          </Field>
        )}

        {seg.type === 'vip' && (
          <Field label="Carte offerte" hint="Activée tout de suite avec sa dotation. Un joueur qui a déjà cette carte (ou mieux) ne peut pas tomber dessus.">
            <select className={selectClass} value={seg.vipTier ?? 'SILVER'} onChange={(e) => setSeg({ ...seg, vipTier: e.target.value as 'SILVER' | 'GOLD' | 'DIAMOND' })}>
              <option value="SILVER" className="bg-black">Silver</option>
              <option value="GOLD" className="bg-black">Gold</option>
              <option value="DIAMOND" className="bg-black">Diamond</option>
            </select>
          </Field>
        )}

        {seg.type === 'pack' && (
          <Field label="Album" hint="Le joueur reçoit un booster à ouvrir gratuitement sur la page Collections.">
            <select className={selectClass} value={seg.packSet ?? packSets[0]?.id} onChange={(e) => setSeg({ ...seg, packSet: e.target.value })}>
              {packSets.map((p) => (
                <option key={p.id} value={p.id} className="bg-black">
                  {p.name} · {fmt(p.price)} jetons
                </option>
              ))}
            </select>
          </Field>
        )}

        {seg.type === 'voucher' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Machine">
              <select
                className={selectClass}
                value={seg.voucherGame ?? 'doghouse'}
                onChange={(e) => {
                  const game = e.target.value as 'doghouse' | 'wanted';
                  setSeg({ ...seg, voucherGame: game, voucherBuy: game === 'wanted' ? 'gtr' : 'buy' });
                }}
              >
                <option value="doghouse" className="bg-black">The Dog House</option>
                <option value="wanted" className="bg-black">Wanted</option>
              </select>
            </Field>
            <Field label="Bonus">
              {seg.voucherGame === 'wanted' ? (
                <select className={selectClass} value={seg.voucherBuy ?? 'gtr'} onChange={(e) => setSeg({ ...seg, voucherBuy: e.target.value as 'gtr' | 'duel' | 'dmh' })}>
                  <option value="gtr" className="bg-black">Tours gratuits</option>
                  <option value="duel" className="bg-black">Duel</option>
                  <option value="dmh" className="bg-black">Dead Man's Hand</option>
                </select>
              ) : (
                <input className={inputClass} disabled value="Tours gratuits" />
              )}
            </Field>
            <Field label="Valeur">
              <NumberInput value={Number(seg.voucherValue) || 0} min={1} onChange={(v) => setSeg({ ...seg, voucherValue: Math.max(1, v) })} suffix="⛁" />
            </Field>
          </div>
        )}

        {(seg.type === 'mystery' || seg.type === 'clothing') && (
          <Field label="Objet reçu" hint="Nom affiché dans l'inventaire du joueur. Vous le remettez en jeu depuis « Lots des joueurs ». Non chiffré dans la rentabilité.">
            <input className={inputClass} maxLength={80} value={String(seg.value)} onChange={(e) => setSeg({ ...seg, value: e.target.value })} />
          </Field>
        )}

        {/* Chance */}
        <Field label="Poids" hint={`Chance obtenue : ${fmt(chance, chance < 1 ? 2 : 1)} % (environ 1 tour sur ${chance > 0 ? fmt(100 / chance) : '∞'}).`}>
          <NumberInput value={seg.dropRate} min={0} step={0.5} onChange={(v) => setSeg({ ...seg, dropRate: Math.max(0, v) })} />
        </Field>

        {/* Apparence */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 pt-4 border-t border-white/10">
          <Field label="Nom affiché">
            <input className={inputClass} maxLength={30} value={seg.label} onChange={(e) => setSeg({ ...seg, label: e.target.value })} />
          </Field>
          <Field label="Icône">
            <input className={cx(inputClass, 'w-16 text-center')} maxLength={4} value={seg.icon} onChange={(e) => setSeg({ ...seg, icon: e.target.value })} />
          </Field>
          <Field label="Couleur">
            <input type="color" className="h-10 w-12 rounded-xl bg-transparent border border-white/10 cursor-pointer" value={seg.color} onChange={(e) => setSeg({ ...seg, color: e.target.value })} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500">{missingVehicle ? 'Choisissez un véhicule du catalogue.' : 'Pris en compte après « Enregistrer ».'}</span>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" disabled={invalid} onClick={() => onApply({ ...seg, label: seg.label.trim() })}>
              {isNew ? 'Ajouter' : 'Valider'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
