import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Car, Check, Download, Gift, Loader2, PackageCheck, RefreshCw, Search, Undo2, Upload, X } from 'lucide-react';
import { useCasinoAdmin, type MockCitizen } from '../../context/CasinoAdminContext';
import {
  apiAdminGrantReward,
  apiAdminImportVehicles,
  apiAdminUpdateReward,
  dbCountVehicles,
  dbFetchRewards,
  normalizeVehicleImport,
  type PlayerReward,
  type RewardStatus,
  type VehicleCatalogEntry,
} from '../../lib/supabase';
import { REWARD_STATUS, formatRewardDate, vehicleDisplayName } from '../../lib/rewards';
import { VehiclePicker } from './VehiclePicker';

interface RewardsPanelProps {
  showToast: (msg: string) => void;
}

type PendingAction = { reward: PlayerReward; status: 'DELIVERED' | 'REVOKED' | 'IN_INVENTORY' } | null;

const ACTION_LABEL: Record<'DELIVERED' | 'REVOKED' | 'IN_INVENTORY', string> = {
  DELIVERED: 'Confirmer la remise en jeu',
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

  // Catalogue
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const citizenById = useMemo(() => new Map(citizens.map((c) => [c.profileId, c])), [citizens]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, count] = await Promise.all([dbFetchRewards(undefined, 300), dbCountVehicles()]);
      setRewards(rows);
      setCatalogCount(count);
    } catch (err) {
      showToast((err as Error).message);
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
          ? `« ${pending.reward.label} » marqué comme remis en jeu.`
          : pending.status === 'REVOKED'
            ? `« ${pending.reward.label} » retiré au joueur.`
            : `« ${pending.reward.label} » remis dans l’inventaire.`,
      );
      setPending(null);
      setPendingNote('');
      await Promise.all([load(), refreshLogs(), refreshCitizens()]);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async () => {
    if (!grantCitizenId) {
      showToast('Choisissez un citoyen.');
      return;
    }
    if (!grantVehicle && !grantLabel.trim()) {
      showToast('Choisissez un véhicule ou saisissez le nom du lot.');
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
      showToast((err as Error).message);
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

  const handleImportBundled = async () => {
    setBusy(true);
    try {
      const res = await fetch('/data/ctg_vehicles.json');
      if (!res.ok) throw new Error(`Catalogue introuvable (HTTP ${res.status})`);
      await importRows(await res.json());
    } catch (err) {
      showToast((err as Error).message);
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
      showToast(err instanceof SyntaxError ? 'Le fichier n’est pas un JSON valide.' : (err as Error).message);
    } finally {
      setBusy(false);
      setImportProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const actionButtons = (r: PlayerReward) => (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {(r.status === 'CLAIMED' || r.status === 'IN_INVENTORY') && (
        <button
          type="button"
          onClick={() => setPending({ reward: r, status: 'DELIVERED' })}
          className="px-2.5 py-1.5 rounded-lg bg-white text-black text-[11px] font-bold uppercase tracking-wider hover:bg-neutral-200 cursor-pointer flex items-center gap-1"
        >
          <PackageCheck size={12} /> Remis en jeu
        </button>
      )}
      {r.status !== 'REVOKED' && (
        <button
          type="button"
          onClick={() => setPending({ reward: r, status: 'REVOKED' })}
          className="px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-[11px] font-bold uppercase tracking-wider hover:bg-red-500/10 cursor-pointer flex items-center gap-1"
        >
          <X size={12} /> Retirer
        </button>
      )}
      {(r.status === 'REVOKED' || r.status === 'DELIVERED' || r.status === 'CLAIMED') && (
        <button
          type="button"
          onClick={() => setPending({ reward: r, status: 'IN_INVENTORY' })}
          className="px-2.5 py-1.5 rounded-lg border border-white/15 text-neutral-300 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 cursor-pointer flex items-center gap-1"
          title="Remettre dans l’inventaire du joueur"
        >
          <Undo2 size={12} /> Inventaire
        </button>
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
            {r.source === 'wheel' ? 'Roue' : 'Don direction'} · {formatRewardDate(r.created_at)}
            {r.handled_by ? ` · traité par ${r.handled_by}` : ''}
          </p>
          {r.note && <p className="text-[11px] text-neutral-400 italic mt-0.5">« {r.note} »</p>}
        </div>
        {actionButtons(r)}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">Lots &amp; Véhicules</h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Lots gagnés à la roue ou offerts, réclamations des joueurs et remise en jeu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-neutral-200 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {/* Claims to handle */}
      <section className="p-5 rounded-2xl bg-sky-500/[0.04] border border-sky-500/20 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2">
          <PackageCheck size={14} /> Réclamations à remettre en jeu ({claims.length})
        </h2>
        {claims.length === 0 ? (
          <p className="text-xs text-neutral-500">Aucune réclamation en attente.</p>
        ) : (
          claims.map(rewardRow)
        )}
      </section>

      {/* All rewards */}
      <section className="p-5 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white">Tous les lots ({rewards.length})</h2>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Joueur, lot, modèle…"
                className="h-9 pl-8 pr-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as RewardStatus | 'ALL')}
              className="h-9 px-2 rounded-xl bg-neutral-900 border border-white/10 text-xs text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Tous statuts</option>
              {(Object.keys(REWARD_STATUS) as RewardStatus[]).map((s) => (
                <option key={s} value={s}>
                  {REWARD_STATUS[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <p className="text-xs text-neutral-500 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Chargement…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-neutral-500">Aucun lot.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">{visible.map(rewardRow)}</div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grant */}
        <section className="p-5 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Gift size={14} /> Donner un véhicule ou un lot
          </h2>
          <select
            value={grantCitizenId}
            onChange={(e) => setGrantCitizenId(e.target.value)}
            className="h-10 px-3 rounded-xl bg-neutral-900 border border-white/10 text-sm text-white focus:outline-none cursor-pointer"
          >
            <option value="">— Choisir un citoyen —</option>
            {citizens.map((c) => (
              <option key={c.profileId} value={c.profileId}>
                {citizenLabel(c)}
              </option>
            ))}
          </select>
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
            placeholder={grantVehicle ? 'Nom affiché (optionnel)' : 'Nom du lot (si pas de véhicule)'}
            className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
          />
          <input
            type="text"
            value={grantNote}
            onChange={(e) => setGrantNote(e.target.value)}
            maxLength={280}
            placeholder="Note (optionnelle, visible par le joueur)"
            className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
          />
          <button
            type="button"
            onClick={handleGrant}
            disabled={busy}
            className="h-11 rounded-xl bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-50 cursor-pointer"
          >
            Ajouter à l’inventaire du joueur
          </button>
        </section>

        {/* Catalogue */}
        <section className="p-5 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Car size={14} /> Catalogue véhicules
          </h2>
          <p className="text-3xl font-bold font-mono text-white">
            {catalogCount === null ? '…' : catalogCount.toLocaleString('fr-FR')}
            <span className="text-sm font-normal text-neutral-500"> véhicules</span>
          </p>
          <p className="text-xs text-neutral-400">
            Utilisés pour les lots de la roue et les dons. L’import met à jour les véhicules existants et ajoute les nouveaux
            (format JSON du panel CTG accepté tel quel).
          </p>
          {importProgress && (
            <div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[11px] font-mono text-neutral-500 mt-1">
                {importProgress.done} / {importProgress.total}
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 mt-auto">
            <button
              type="button"
              onClick={handleImportBundled}
              disabled={busy}
              className="flex-1 h-10 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={13} /> Réimporter le catalogue CTG
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex-1 h-10 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload size={13} /> Importer un fichier JSON
            </button>
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
        </section>
      </div>

      {/* Confirm modal */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-neutral-950 border border-white/15 rounded-3xl p-6 flex flex-col gap-4">
            <h3 className="text-base font-bold text-white">{ACTION_LABEL[pending.status]}</h3>
            <p className="text-sm text-neutral-300">
              <strong className="text-white">{pending.reward.label}</strong> — {citizenLabel(citizenById.get(pending.reward.profile_id))}
            </p>
            {pending.status === 'DELIVERED' && (
              <p className="text-xs text-neutral-400">
                Confirmez uniquement après avoir donné le véhicule / lot au joueur en jeu. Il sera ajouté à son garage sur le site.
              </p>
            )}
            <input
              type="text"
              value={pendingNote}
              onChange={(e) => setPendingNote(e.target.value)}
              maxLength={280}
              placeholder="Note (optionnelle, ex. plaque, motif du retrait…)"
              className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setPendingNote('');
                }}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-300 text-xs font-semibold uppercase tracking-wider cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={runAction}
                disabled={busy}
                className={`flex-1 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                  pending.status === 'REVOKED' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-white text-black hover:bg-neutral-200'
                }`}
              >
                {busy ? 'Envoi…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
