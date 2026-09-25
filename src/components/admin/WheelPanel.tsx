import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Car, Coins, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  DEFAULT_SEGMENTS,
  useCasinoAdmin,
  type PodiumVehicleConfig,
  type RewardType,
  type WheelSegmentConfig,
} from '../../context/CasinoAdminContext';
import { vehicleDisplayName } from '../../lib/rewards';
import { VehiclePicker } from './VehiclePicker';
import { Badge, Button, Card, Field, HelpBox, Modal, NumberInput, PageHeader, SaveBar, cx, fmt, inputClass } from './ui';

const TYPE_LABEL: Record<RewardType, string> = {
  chips: 'Jetons',
  vehicle: 'Véhicule',
  mystery: 'Objet mystère',
  clothing: 'Vêtement',
};

export const WheelPanel: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const {
    segments,
    podiumVehicle,
    gamesConfig,
    saveGamesConfig,
    saveSegments,
    savePodiumVehicle,
  } = useCasinoAdmin();

  const [draft, setDraft] = useState<WheelSegmentConfig[]>(segments);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ index: number; seg: WheelSegmentConfig } | null>(null);
  const [podiumDraft, setPodiumDraft] = useState<PodiumVehicleConfig>(podiumVehicle);
  const spinPrice = gamesConfig.wheel.spinPrice;
  const [priceDraft, setPriceDraft] = useState(spinPrice);

  useEffect(() => setDraft(segments), [segments]);
  useEffect(() => setPodiumDraft(podiumVehicle), [podiumVehicle]);
  useEffect(() => setPriceDraft(spinPrice), [spinPrice]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(segments);
  const totalWeight = draft.reduce((a, s) => a + Math.max(0, Number(s.dropRate) || 0), 0);
  const chance = (s: WheelSegmentConfig) => (totalWeight > 0 ? (Math.max(0, s.dropRate) / totalWeight) * 100 : 100 / draft.length);
  const expectedChips = useMemo(
    () => draft.reduce((a, s) => a + (s.type === 'chips' ? (Number(s.value) || 0) * (chance(s) / 100) : 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, totalWeight],
  );

  const save = async () => {
    setSaving(true);
    const ok = await saveSegments(draft.map((s, i) => ({ ...s, id: i })));
    setSaving(false);
    if (ok) showToast('Lots de la roue enregistrés.');
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  const rtp = priceDraft > 0 ? (expectedChips / priceDraft) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roue de la Fortune"
        subtitle="Tour payant : le joueur paie le prix du tour en jetons, sans limite de tirages, et gagne l'un des lots ci-dessous."
      />

      <HelpBox title="Comment fonctionnent les chances ?">
        <p>
          Chaque lot a un <b>poids</b>. Sa chance réelle = son poids ÷ la somme de tous les poids. Exemple : si la somme vaut 100, un lot
          de poids 5 sort 5 fois sur 100. Pas besoin que la somme fasse exactement 100 : la colonne « Chance réelle » fait le calcul.
          Un lot à 0 ne sort jamais.
        </p>
        <p>
          Les <b>jetons</b> sont crédités tout de suite. Les <b>véhicules / objets</b> vont dans l'inventaire du joueur, qui les réclame ;
          vous les remettez ensuite en jeu depuis l'onglet « Lots & véhicules ».
        </p>
        <p>
          Le tirage est fait par le serveur. Les changements s'appliquent au tirage suivant, après avoir cliqué sur <b>Enregistrer</b>.
        </p>
      </HelpBox>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Prix d'un tour" icon={<Coins size={15} />}>
          <div className="flex flex-col gap-4">
            <Field label="Prix (jetons)" hint="Débité par le serveur à chaque tour. Aucune limite de tirages par jour.">
              <div className="flex gap-2">
                <NumberInput value={priceDraft} min={1} onChange={setPriceDraft} suffix="⛁" />
                <Button
                  variant="primary"
                  disabled={priceDraft === spinPrice || priceDraft < 1}
                  onClick={async () => {
                    if (await saveGamesConfig({ ...gamesConfig, wheel: { ...gamesConfig.wheel, spinPrice: priceDraft } })) {
                      showToast(`Prix du tour fixé à ${fmt(priceDraft)} jetons.`);
                    }
                  }}
                >
                  Enregistrer
                </Button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/[0.03] border border-white/10 py-2">
                <div className="text-[10px] text-neutral-500">Gain moyen en jetons</div>
                <div className="font-mono text-sm text-white">{fmt(expectedChips)}</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 py-2">
                <div className="text-[10px] text-neutral-500">RTP jetons</div>
                <div className={cx('font-mono text-sm', rtp > 100 ? 'text-rose-400' : 'text-white')}>{fmt(rtp, 1)} %</div>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-[12px] text-neutral-400">
              Le casino garde en moyenne <b className="text-white font-mono">{fmt(Math.max(0, priceDraft - expectedChips))} jetons</b> par
              tour, avant les lots non monétaires (véhicules, objets). Au-dessus de 100 % de RTP, la roue fait perdre des jetons au casino.
            </div>
          </div>
        </Card>

        <Card title="Véhicule du podium" icon={<Car size={15} />}>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 items-center">
              <img src={podiumDraft.imageUrl || '/podium_supercar.jpg'} alt="" className="w-32 h-20 object-cover rounded-xl border border-white/10 shrink-0 bg-black" />
              <div className="min-w-0 flex-1 grid gap-2">
                <input className={inputClass} value={podiumDraft.name} onChange={(e) => setPodiumDraft({ ...podiumDraft, name: e.target.value })} />
                <NumberInput value={podiumDraft.value} onChange={(v) => setPodiumDraft({ ...podiumDraft, value: v })} suffix="$" />
              </div>
            </div>
            <VehiclePicker
              selectedModel={podiumDraft.model}
              className="max-h-40"
              onSelect={(v) =>
                setPodiumDraft({
                  name: vehicleDisplayName(v.manufacturer, v.model),
                  model: v.model,
                  value: v.price || 0,
                  imageUrl: v.photo_full_url || v.photo_url || '/podium_supercar.jpg',
                })
              }
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-neutral-500">Affiché sur la page de la roue. Le lot « véhicule » de la roue suit ce choix.</span>
              <Button
                variant="primary"
                disabled={JSON.stringify(podiumDraft) === JSON.stringify(podiumVehicle)}
                onClick={async () => {
                  if (await savePodiumVehicle(podiumDraft)) showToast(`Podium : ${podiumDraft.name}`);
                }}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="sticky top-0 z-20">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setDraft(segments)} />
      </div>

      <Card
        title={`Lots de la roue (${draft.length})`}
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="subtle" onClick={() => setDraft(DEFAULT_SEGMENTS)}>
              <RotateCcw size={12} /> Lots par défaut
            </Button>
            <Button
              size="sm"
              disabled={draft.length >= 24}
              onClick={() =>
                setEditing({
                  index: -1,
                  seg: { id: draft.length, label: 'NOUVEAU LOT', type: 'chips', value: 1000, color: '#171717', textColor: '#ffffff', icon: '🪙', dropRate: 1 },
                })
              }
            >
              <Plus size={12} /> Ajouter
            </Button>
          </div>
        }
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10">
                <th className="px-5 py-3 font-medium w-10">#</th>
                <th className="px-3 py-3 font-medium">Lot</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Ce que reçoit le joueur</th>
                <th className="px-3 py-3 font-medium w-28">Poids</th>
                <th className="px-3 py-3 font-medium w-40">Chance réelle</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {draft.map((seg, i) => {
                const pct = chance(seg);
                return (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-2.5 font-mono text-neutral-500">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0" style={{ backgroundColor: seg.color }}>
                          {seg.icon}
                        </span>
                        <span className="font-semibold text-white">{seg.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={seg.type === 'chips' ? 'gold' : seg.type === 'vehicle' ? 'info' : 'violet'}>{TYPE_LABEL[seg.type]}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-300 text-[13px]">
                      {seg.type === 'chips' ? <span className="font-mono text-white">{fmt(Number(seg.value))} jetons</span> : String(seg.value)}
                    </td>
                    <td className="px-3 py-2.5">
                      <NumberInput
                        value={seg.dropRate}
                        min={0}
                        step={0.5}
                        onChange={(v) => setDraft(draft.map((s, j) => (j === i ? { ...s, dropRate: Math.max(0, v) } : s)))}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className={cx('h-full rounded-full', seg.type === 'chips' ? 'bg-white' : 'bg-neutral-400')} style={{ width: `${Math.min(100, pct * 3)}%` }} />
                        </div>
                        <span className="font-mono text-xs text-white w-12 text-right">{fmt(pct, 1)} %</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="subtle" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">
                          <ArrowUp size={12} />
                        </Button>
                        <Button size="sm" variant="subtle" onClick={() => move(i, 1)} disabled={i === draft.length - 1} title="Descendre">
                          <ArrowDown size={12} />
                        </Button>
                        <Button size="sm" onClick={() => setEditing({ index: i, seg })}>
                          <Pencil size={12} /> Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={draft.length <= 2}
                          onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                          title="Supprimer ce lot"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-white/10 text-[12px] text-neutral-400 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Somme des poids : <b className="font-mono text-white">{fmt(totalWeight, 2)}</b>
          </span>
          <span>
            Jetons gagnés en moyenne par tirage : <b className="font-mono text-white">{fmt(expectedChips)}</b>
          </span>
          <span>
            Chance d'un lot non monétaire : <b className="font-mono text-sky-300">{fmt(draft.filter((s) => s.type !== 'chips').reduce((a, s) => a + chance(s), 0), 1)} %</b>
          </span>
        </div>
      </Card>

      {editing && (
        <SegmentEditor
          seg={editing.seg}
          onClose={() => setEditing(null)}
          onApply={(seg) => {
            setDraft(editing.index < 0 ? [...draft, seg] : draft.map((s, j) => (j === editing.index ? seg : s)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const SegmentEditor: React.FC<{ seg: WheelSegmentConfig; onClose: () => void; onApply: (s: WheelSegmentConfig) => void }> = ({
  seg: initial,
  onClose,
  onApply,
}) => {
  const [seg, setSeg] = useState(initial);
  return (
    <Modal title="Modifier le lot" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3">
          <Field label="Nom affiché sur la roue">
            <input className={inputClass} maxLength={30} value={seg.label} onChange={(e) => setSeg({ ...seg, label: e.target.value })} />
          </Field>
          <Field label="Icône">
            <input className={cx(inputClass, 'w-16 text-center')} maxLength={4} value={seg.icon} onChange={(e) => setSeg({ ...seg, icon: e.target.value })} />
          </Field>
          <Field label="Couleur">
            <input type="color" className="h-10 w-12 rounded-xl bg-transparent border border-white/10 cursor-pointer" value={seg.color} onChange={(e) => setSeg({ ...seg, color: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type de lot">
            <select
              className={cx(inputClass, 'cursor-pointer')}
              value={seg.type}
              onChange={(e) => {
                const type = e.target.value as RewardType;
                setSeg({
                  ...seg,
                  type,
                  value: type === 'chips' ? Number(seg.value) || 0 : typeof seg.value === 'number' ? '' : seg.value,
                  vehicleModel: type === 'vehicle' ? seg.vehicleModel : undefined,
                });
              }}
            >
              {(Object.keys(TYPE_LABEL) as RewardType[]).map((t) => (
                <option key={t} value={t} className="bg-black">
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Poids (chance)">
            <NumberInput value={seg.dropRate} min={0} step={0.5} onChange={(v) => setSeg({ ...seg, dropRate: Math.max(0, v) })} />
          </Field>
        </div>
        {seg.type === 'chips' ? (
          <Field label="Nombre de jetons gagnés">
            <NumberInput value={Number(seg.value) || 0} min={0} onChange={(v) => setSeg({ ...seg, value: Math.max(0, v) })} suffix="⛁" />
          </Field>
        ) : (
          <Field label="Nom du lot reçu par le joueur" hint="C'est ce qui apparaît dans son inventaire.">
            <input className={inputClass} maxLength={80} value={String(seg.value)} onChange={(e) => setSeg({ ...seg, value: e.target.value })} />
          </Field>
        )}
        {seg.type === 'vehicle' && (
          <Field label={`Véhicule du catalogue ${seg.vehicleModel ? `· ${seg.vehicleModel}` : ''}`}>
            <VehiclePicker
              selectedModel={seg.vehicleModel}
              className="max-h-48"
              onSelect={(v) =>
                setSeg({
                  ...seg,
                  value: vehicleDisplayName(v.manufacturer, v.model),
                  vehicleModel: v.model,
                  imageUrl: v.photo_full_url || v.photo_url || undefined,
                })
              }
            />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => onApply(seg)}>
            Appliquer
          </Button>
        </div>
        <p className="text-[11px] text-neutral-500 text-right -mt-2">Pensez ensuite à cliquer sur « Enregistrer » en haut du tableau.</p>
      </div>
    </Modal>
  );
};
