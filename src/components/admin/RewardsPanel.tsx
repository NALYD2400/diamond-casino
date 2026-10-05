import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Car, Check, Download, Gift, Layers, Loader2, Lock, PackageCheck, PencilLine, RefreshCw, Search, Undo2, Upload, X } from 'lucide-react';
import { useCasinoAdmin, type MockCitizen } from '../../context/CasinoAdminContext';
import {
  apiAdminGrantReward,
  apiAdminGrantCollectionPack,
  apiAdminGrantVoucher,
  apiCollectionCatalog,
  apiAdminImportVehicles,
  apiAdminSetVehiclePrice,
  apiAdminUpdateReward,
  dbCountVehicles,
  dbFetchRewards,
  normalizeVehicleImport,
  type PlayerReward,
  type RewardStatus,
  type VehicleCatalogEntry,
} from '../../lib/supabase';
import { REWARD_SOURCE, REWARD_STATUS, formatRewardDate, vehicleDisplayName } from '../../lib/rewards';
import { VehiclePicker } from './VehiclePicker';
import { Button, Card, Field, HelpBox, Modal, NumberInput, PageHeader, cx, fmt, inputClass } from './ui';

interface RewardsPanelProps {
  showToast: (msg: string, error?: boolean) => void;
}

type PendingAction = { reward: PlayerReward; status: 'DELIVERED' | 'REVOKED' | 'IN_INVENTORY' } | null;

const ACTION_LABEL: Record<'DELIVERED' | 'REVOKED' | 'IN_INVENTORY', string> = {
  DELIVERED: 'Confirmer la livraison au joueur',
  REVOKED: 'Confirmer le retrait',
  IN_INVENTORY: 'Remettre dans l’inventaire',
};

export const RewardsPanel: React.FC<RewardsPanelProps> = ({ showToast }) => {
  const { citizens, refreshCitizens, refreshLogs } = useCasinoAdmin();

  const [rewards, setRewards] = useState<PlayerReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RewardStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [pendingNote, setPendingNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Grant form
  const [grantCitizenId, setGrantCitizenId] = useState('');
  const [grantVehicle, setGrantVehicle] = useState<VehicleCatalogEntry | null>(null);
  const [grantLabel, setGrantLabel] = useState('');
  const [grantNote, setGrantNote] = useState('');
  // Bon de bonus offert (bonus buy gratuit sur une machine)
  const [voucherGame, setVoucherGame] = useState<'doghouse' | 'wanted'>('doghouse');
  const [voucherBuy, setVoucherBuy] = useState<'gtr' | 'duel' | 'dmh'>('gtr');
  const [voucherValue, setVoucherValue] = useState(20000);

  // Catalogue
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Correction du prix d'un véhicule
  const [priceVehicle, setPriceVehicle] = useState<VehicleCatalogEntry | null>(null);
  const [priceValue, setPriceValue] = useState('');
  const [priceUpdateInventory, setPriceUpdateInventory] = useState(true);
  const [pickerReload, setPickerReload] = useState(0);

  const citizenById = useMemo(() => new Map(citizens.map((c) => [c.profileId, c])), [citizens]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Les réclamations en attente sont toujours chargées, même si elles sont plus anciennes que les 300 derniers lots
      const [rows, claimed, count] = await Promise.all([dbFetchRewards(undefined, 300), dbFetchRewards('CLAIMED', 500), dbCountVehicles()]);
      const seen = new Set(rows.map((r) => r.id));
      setRewards([...rows, ...claimed.filter((r) => !seen.has(r.id))]);
      setCatalogCount(count);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const claims = rewards.filter((r) => r.status === 'CLAIMED');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rewards.filter((r) => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      if (!q) return true;
      const c = citizenById.get(r.profile_id);
      return (
        r.label.toLowerCase().includes(q) ||
        (r.vehicle_model || '').toLowerCase().includes(q) ||
        (c ? `${c.rpFirstName} ${c.rpLastName} ${c.citizenId}`.toLowerCase().includes(q) : false)
      );
    });
  }, [rewards, filter, search, citizenById]);

  const citizenLabel = (c?: MockCitizen) => (c ? `${c.rpFirstName} ${c.rpLastName} · #${c.citizenId}` : 'Citoyen supprimé');

  const runAction = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiAdminUpdateReward(pending.reward.id, pending.status, pendingNote.trim() || undefined);
      showToast(
        pending.status === 'DELIVERED'
          ? `« ${pending.reward.label} » marqué comme livré au joueur.`
          : pending.status === 'REVOKED'
            ? `« ${pending.reward.label} » retiré au joueur.`
            : `« ${pending.reward.label} » remis dans l’inventaire.`,
      );
      setPending(null);
      setPendingNote('');
      await Promise.all([load(), refreshLogs(), refreshCitizens()]);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async () => {
    if (!grantCitizenId) {
      showToast('Choisissez un joueur.', true);
      return;
    }
    if (!grantVehicle && !grantLabel.trim()) {
      showToast('Choisissez un véhicule ou saisissez le nom du lot.', true);
      return;
    }
    setBusy(true);
    try {
      await apiAdminGrantReward(grantCitizenId, {
        vehicleModel: grantVehicle?.model,
        label: grantLabel.trim() || undefined,
        note: grantNote.trim() || undefined,
      });
      showToast('Lot ajouté à l’inventaire du joueur.');
      setGrantVehicle(null);
      setGrantLabel('');
      setGrantNote('');
      await Promise.all([load(), refreshLogs()]);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  // Boosters de collection offerts
  const [packSets, setPackSets] = useState<{ id: string; name: string }[]>([]);
  const [packSet, setPackSet] = useState('autos');
  const [packQty, setPackQty] = useState(1);
  useEffect(() => {
    apiCollectionCatalog()
      .then((c) => {
        setPackSets(c.sets.map((x) => ({ id: x.id, name: x.name })));
        if (c.sets[0]) setPackSet((cur) => (c.sets.some((x) => x.id === cur) ? cur : c.sets[0].id));
      })
      .catch(() => {});
  }, []);

  const handleGrantPack = async () => {
    if (!grantCitizenId) {
      showToast('Choisissez un joueur.', true);
      return;
    }
    setBusy(true);
    try {
      const n = await apiAdminGrantCollectionPack(grantCitizenId, packSet, Math.min(50, Math.max(1, Math.floor(packQty) || 1)), grantNote.trim() || undefined);
      showToast(`${n} booster(s) de collection ajouté(s) à l’inventaire du joueur.`);
      setGrantNote('');
      await Promise.all([load(), refreshLogs()]);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const handleGrantVoucher = async () => {
    if (!grantCitizenId) {
      showToast('Choisissez un joueur.', true);
      return;
    }
    if (!Number.isFinite(voucherValue) || voucherValue < 1) {
      showToast('Saisissez une valeur valide.', true);
      return;
    }
    setBusy(true);
    try {
      await apiAdminGrantVoucher(grantCitizenId, {
        game: voucherGame,
        buy: voucherGame === 'wanted' ? voucherBuy : 'buy',
        value: Math.floor(voucherValue),
        note: grantNote.trim() || undefined,
      });
      showToast('Bon de bonus ajouté à l’inventaire du joueur.');
      setGrantNote('');
      await Promise.all([load(), refreshLogs()]);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const importRows = async (raw: unknown) => {
    const rows = normalizeVehicleImport(raw);
    if (rows.length === 0) throw new Error('Aucun véhicule trouvé dans le fichier.');
    setImportProgress({ done: 0, total: rows.length });
    const count = await apiAdminImportVehicles(rows, (done) => setImportProgress({ done, total: rows.length }));
    showToast(`${count.toLocaleString('fr-FR')} véhicules importés / mis à jour.`);
    setCatalogCount(await dbCountVehicles());
    await refreshLogs();
  };

  const selectPriceVehicle = (v: VehicleCatalogEntry) => {
    setPriceVehicle(v);
    setPriceValue(String(v.price ?? 0));
  };

  const handleSetPrice = async () => {
    if (!priceVehicle) return;
    const price = Number(priceValue.replace(/[\s .,]/g, ''));
    if (!Number.isFinite(price) || price < 0) {
      showToast('Prix invalide.', true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiAdminSetVehiclePrice(priceVehicle.model, price, priceUpdateInventory);
      showToast(
        `${vehicleDisplayName(priceVehicle.manufacturer, priceVehicle.model)} : ${res.old_price.toLocaleString('fr-FR')} → ${res.price.toLocaleString('fr-FR')}` +
          (priceUpdateInventory ? ` (${res.updated_rewards} lot(s) en inventaire mis à jour)` : ''),
      );
      setPriceVehicle({ ...priceVehicle, price: res.price, price_locked: true });
      setPickerReload((k) => k + 1);
      await Promise.all([load(), refreshLogs()]);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const handleImportBundled = async () => {
    setBusy(true);
    try {
      const res = await fetch('/data/ctg_vehicles.json');
      if (!res.ok) throw new Error(`Catalogue introuvable (HTTP ${res.status})`);
      await importRows(await res.json());
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
      setImportProgress(null);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Fichier trop volumineux (20 Mo maximum).');
      await importRows(JSON.parse(await file.text()));
    } catch (err) {
      showToast(err instanceof SyntaxError ? 'Le fichier n’est pas un JSON valide.' : (err as Error).message, true);
    } finally {
      setBusy(false);
      setImportProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const actionButtons = (r: PlayerReward) => (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {(r.status === 'CLAIMED' || r.status === 'IN_INVENTORY') && (
        <Button size="sm" variant="primary" onClick={() => setPending({ reward: r, status: 'DELIVERED' })}>
          <PackageCheck size={12} /> Marquer livré
        </Button>
      )}
      {(r.status === 'REVOKED' || r.status === 'DELIVERED' || r.status === 'CLAIMED') && (
        <Button size="sm" onClick={() => setPending({ reward: r, status: 'IN_INVENTORY' })} title="Remettre dans l’inventaire du joueur">
          <Undo2 size={12} /> Inventaire
        </Button>
      )}
      {r.status !== 'REVOKED' && r.status !== 'SOLD' && (
        <Button size="sm" variant="danger" onClick={() => setPending({ reward: r, status: 'REVOKED' })}>
          <X size={12} /> Retirer
        </Button>
      )}
    </div>
  );

  const rewardRow = (r: PlayerReward) => {
    const c = citizenById.get(r.profile_id);
    const status = REWARD_STATUS[r.status];
    return (
      <div key={r.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-24 h-14 rounded-lg overflow-hidden bg-neutral-900 shrink-0 flex items-center justify-center text-neutral-600">
          {r.image_url ? <img src={r.image_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : r.kind === 'vehicle' ? <Car size={20} /> : <Gift size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{r.label}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">{citizenLabel(c)}</p>
          <p className="text-[11px] font-mono text-neutral-500 mt-0.5">
            {r.vehicle_model ? `${r.vehicle_model} · ` : ''}
            {REWARD_SOURCE[r.source]?.short ?? r.source} · {formatRewardDate(r.created_at)}
            {r.handled_by ? ` · traité par ${r.handled_by}` : ''}
          </p>
          {r.note && <p className="text-[11px] text-neutral-400 italic mt-0.5">« {r.note} »</p>}
        </div>
        {actionButtons(r)}
      </div>
    );
  };

  const closePending = () => {
    setPending(null);
    setPendingNote('');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lots & véhicules"
        subtitle="Lots gagnés à la roue ou offerts, réclamations des joueurs et livraison en ville."
        actions={
          <Button onClick={() => void load()} loading={loading}>
            <RefreshCw size={13} /> Actualiser
          </Button>
        }
      />

      <HelpBox>
        <p>
          Chaque lot gagné par un joueur (véhicule ou objet de la roue, cadeau de la direction) arrive dans <b>son inventaire</b> (Espace
          membre). Le joueur peut alors <b>le revendre</b> contre des jetons (rien à faire de votre côté, le lot passe en « Revendu »), ou{' '}
          <b>le réclamer</b> pour le recevoir en ville : il apparaît dans « Réclamations à livrer ». Donnez-le au joueur en jeu, puis cliquez{' '}
          <b>Marquer livré</b>.
        </p>
        <p className="text-neutral-400">
          <b>Retirer</b> annule un lot (erreur, triche…). <b>Marquer livré</b> sur un lot encore « Dans l'inventaire » sert si vous l'avez déjà
          remis en jeu sans réclamation. Les boosters de collection et les bons de bonus s'utilisent directement par le joueur : rien à livrer.
        </p>
      </HelpBox>

      <Card title={`Réclamations à livrer (${claims.length})`} icon={<PackageCheck size={15} />} className={claims.length > 0 ? 'border-sky-400/30' : undefined}>
        {claims.length === 0 ? <p className="text-xs text-neutral-500">Aucune réclamation en attente.</p> : <div className="flex flex-col gap-2">{claims.map(rewardRow)}</div>}
      </Card>

      <Card
        title={`Tous les lots (${rewards.length})`}
        right={
          <div className="flex gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Joueur, lot, modèle…"
                className={cx(inputClass, 'h-8 w-44 pl-8 text-xs')}
              />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as RewardStatus | 'ALL')} className={cx(inputClass, 'h-8 w-auto text-xs cursor-pointer')}>
              <option value="ALL" className="bg-black">
                Tous statuts
              </option>
              {(Object.keys(REWARD_STATUS) as RewardStatus[]).map((s) => (
                <option key={s} value={s} className="bg-black">
                  {REWARD_STATUS[s].label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {loading ? (
          <p className="text-xs text-neutral-500 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Chargement…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-neutral-500">Aucun lot.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">{visible.map(rewardRow)}</div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Offrir quelque chose à un joueur" icon={<Gift size={15} />}>
          <div className="flex flex-col gap-5">
            <Field label="Joueur">
              <select value={grantCitizenId} onChange={(e) => setGrantCitizenId(e.target.value)} className={cx(inputClass, 'cursor-pointer')}>
                <option value="" className="bg-black">
                  — Choisir un joueur —
                </option>
                {citizens.map((c) => (
                  <option key={c.profileId} value={c.profileId} className="bg-black">
                    {citizenLabel(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note (optionnelle, visible par le joueur)">
              <input type="text" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} maxLength={280} className={inputClass} />
            </Field>

            <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
              <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
                <Car size={14} className="text-neutral-400" /> Véhicule ou objet
              </h3>
              <VehiclePicker selectedModel={grantVehicle?.model} onSelect={setGrantVehicle} className="max-h-56" />
              {grantVehicle && (
                <p className="text-xs text-white flex items-center gap-2">
                  <Check size={13} /> {vehicleDisplayName(grantVehicle.manufacturer, grantVehicle.model)}
                  <button type="button" onClick={() => setGrantVehicle(null)} className="text-neutral-500 hover:text-white cursor-pointer" aria-label="Retirer le véhicule">
                    <X size={12} />
                  </button>
                </p>
              )}
              <input
                type="text"
                value={grantLabel}
                onChange={(e) => setGrantLabel(e.target.value)}
                maxLength={80}
                placeholder={grantVehicle ? 'Nom affiché (optionnel)' : 'Nom de l’objet (si pas de véhicule)'}
                className={inputClass}
              />
              <Button variant="primary" onClick={handleGrant} disabled={busy}>
                Ajouter à l’inventaire du joueur
              </Button>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
              <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
                <Gift size={14} className="text-neutral-400" /> Bonus de machine
              </h3>
              <p className="text-[11px] text-neutral-500">Le joueur déclenche le bonus gratuitement depuis l’inventaire. La mise est déduite de la valeur choisie.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={voucherGame} onChange={(e) => setVoucherGame(e.target.value as 'doghouse' | 'wanted')} className={cx(inputClass, 'cursor-pointer')}>
                  <option value="doghouse" className="bg-black">
                    The Dog House
                  </option>
                  <option value="wanted" className="bg-black">
                    Wanted
                  </option>
                </select>
                {voucherGame === 'wanted' ? (
                  <select value={voucherBuy} onChange={(e) => setVoucherBuy(e.target.value as 'gtr' | 'duel' | 'dmh')} className={cx(inputClass, 'cursor-pointer')}>
                    <option value="gtr" className="bg-black">
                      Tours gratuits
                    </option>
                    <option value="duel" className="bg-black">
                      Duel at Dawn
                    </option>
                    <option value="dmh" className="bg-black">
                      Dead Man’s Hand
                    </option>
                  </select>
                ) : (
                  <input disabled value="Tours gratuits" className={cx(inputClass, 'text-neutral-400')} />
                )}
                <NumberInput value={voucherValue} min={1} onChange={setVoucherValue} suffix="⛁" />
              </div>
              <Button onClick={handleGrantVoucher} disabled={busy}>
                Offrir le bonus
              </Button>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
              <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
                <Layers size={14} className="text-neutral-400" /> Boosters de collection
              </h3>
              <p className="text-[11px] text-neutral-500">Le joueur les ouvre gratuitement sur la page Collections (1 à 50 boosters).</p>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <select value={packSet} onChange={(e) => setPackSet(e.target.value)} className={cx(inputClass, 'cursor-pointer')}>
                  {packSets.map((x) => (
                    <option key={x.id} value={x.id} className="bg-black">
                      {x.name}
                    </option>
                  ))}
                </select>
                <NumberInput value={packQty} min={1} max={50} onChange={setPackQty} suffix="×" />
              </div>
              <Button onClick={handleGrantPack} disabled={busy || packSets.length === 0}>
                Offrir les boosters
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Catalogue véhicules" icon={<Car size={15} />}>
            <div className="flex flex-col gap-4">
              <p className="text-3xl font-bold font-mono text-white">
                {catalogCount === null ? '…' : fmt(catalogCount)}
                <span className="text-sm font-normal text-neutral-500"> véhicules</span>
              </p>
              <p className="text-xs text-neutral-400">
                Utilisés pour les lots de la roue et les dons. L’import met à jour les véhicules existants et ajoute les nouveaux (format JSON du
                panel CTG accepté tel quel).
              </p>
              {importProgress && (
                <div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-white transition-all" style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }} />
                  </div>
                  <p className="text-[11px] font-mono text-neutral-500 mt-1">
                    {importProgress.done} / {importProgress.total}
                  </p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="flex-1" onClick={handleImportBundled} disabled={busy}>
                  <Download size={13} /> Réimporter le catalogue CTG
                </Button>
                <Button className="flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <Upload size={13} /> Importer un fichier JSON
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportFile(f);
                  }}
                />
              </div>
            </div>
          </Card>

          <Card title="Corriger le prix d’un véhicule" icon={<PencilLine size={15} />}>
            <div className="flex flex-col gap-4">
              <p className="text-xs text-neutral-400">
                Le nouveau prix s’applique partout : lots de la roue, collections, revente. Un prix corrigé ici est protégé : les prochains
                imports ne l’écrasent plus.
              </p>
              <VehiclePicker selectedModel={priceVehicle?.model} onSelect={selectPriceVehicle} className="max-h-48" reloadKey={pickerReload} />
              {priceVehicle ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
                    {vehicleDisplayName(priceVehicle.manufacturer, priceVehicle.model)}
                    <span className="text-[11px] font-mono text-neutral-500">{priceVehicle.model}</span>
                    {priceVehicle.price_locked && (
                      <span className="text-[10px] text-amber-300 flex items-center gap-1" title="Prix corrigé à la main, ignoré par l’import">
                        <Lock size={10} /> corrigé
                      </span>
                    )}
                  </p>
                  <Field label={`Nouveau prix (actuel : ${fmt(priceVehicle.price ?? 0)})`}>
                    <input type="text" inputMode="numeric" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} className={cx(inputClass, 'font-mono')} />
                  </Field>
                  <label className="flex items-start gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input type="checkbox" checked={priceUpdateInventory} onChange={(e) => setPriceUpdateInventory(e.target.checked)} className="mt-0.5" />
                    Appliquer aussi aux exemplaires déjà gagnés encore dans les inventaires (valeur de revente)
                  </label>
                  <Button variant="primary" onClick={handleSetPrice} disabled={busy || priceValue.trim() === ''}>
                    Enregistrer le prix
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">Choisissez un véhicule dans la liste pour modifier son prix.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {pending && (
        <Modal title={ACTION_LABEL[pending.status]} onClose={closePending} width="max-w-md">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-300">
              <strong className="text-white">{pending.reward.label}</strong> — {citizenLabel(citizenById.get(pending.reward.profile_id))}
            </p>
            {pending.status === 'DELIVERED' && (
              <p className="text-xs text-neutral-400">Confirmez uniquement après avoir donné le véhicule / lot au joueur en jeu. Il sera ajouté à son garage sur le site.</p>
            )}
            {pending.status === 'IN_INVENTORY' && pending.reward.status === 'DELIVERED' && (
              <p className="text-xs text-amber-200">
                Ce lot a déjà été remis en jeu : de retour dans l’inventaire, il ne pourra plus être revendu contre des jetons (sinon le joueur
                garderait la voiture en ville ET toucherait les jetons). Pensez à récupérer le véhicule en jeu si besoin.
              </p>
            )}
            <input
              type="text"
              value={pendingNote}
              onChange={(e) => setPendingNote(e.target.value)}
              maxLength={280}
              placeholder="Note (optionnelle, ex. plaque, motif du retrait…)"
              className={inputClass}
            />
            <div className="flex justify-end gap-2">
              <Button variant="subtle" onClick={closePending}>
                Annuler
              </Button>
              <Button variant={pending.status === 'REVOKED' ? 'danger' : 'primary'} onClick={runAction} loading={busy}>
                Confirmer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
