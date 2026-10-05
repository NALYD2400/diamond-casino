import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Car,
  Check,
  Coins,
  Copy,
  Download,
  Gift,
  Inbox,
  Layers,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useCasinoAdmin, type MockCitizen } from '../../context/CasinoAdminContext';
import {
  apiAdminGrantCollectionPack,
  apiAdminGrantReward,
  apiAdminGrantVoucher,
  apiAdminImportVehicles,
  apiAdminSetVehiclePrice,
  apiAdminUpdateReward,
  apiCollectionCatalog,
  dbCountVehicles,
  dbFetchRewards,
  normalizeVehicleImport,
  type PlayerReward,
  type RewardStatus,
  type VehicleCatalogEntry,
} from '../../lib/supabase';
import { REWARD_SOURCE, REWARD_STATUS, formatRewardDate, vehicleDisplayName } from '../../lib/rewards';
import { PlayerPicker } from './PlayerPicker';
import { VehiclePicker } from './VehiclePicker';
import { Badge, Button, Card, EmptyState, Field, Modal, NumberInput, PageHeader, Segmented, cx, fmt, inputClass } from './ui';

type Tab = 'deliver' | 'all' | 'give' | 'catalog';
type Action = 'DELIVERED' | 'REVOKED' | 'IN_INVENTORY';
type PendingAction = { reward: PlayerReward; status: Action } | null;
type GiftKind = 'vehicle' | 'item' | 'voucher' | 'pack';

const KIND_LABEL: Record<PlayerReward['kind'], string> = {
  vehicle: 'Véhicule',
  item: 'Objet',
  voucher: 'Bonus de machine',
  pack: 'Booster',
};

/** Seuls les véhicules et les objets se remettent en ville ; bonus et boosters s'utilisent sur le site */
const isPhysical = (r: PlayerReward) => r.kind === 'vehicle' || r.kind === 'item';

/** Actions possibles selon l'état du lot */
function actionsFor(r: PlayerReward): { status: Action; label: string }[] {
  switch (r.status) {
    case 'CLAIMED':
      return [
        { status: 'DELIVERED', label: 'Livré' },
        { status: 'IN_INVENTORY', label: 'Refuser la réclamation' },
        { status: 'REVOKED', label: 'Retirer' },
      ];
    case 'IN_INVENTORY':
      return [...(isPhysical(r) ? [{ status: 'DELIVERED' as const, label: 'Déjà remis en jeu' }] : []), { status: 'REVOKED', label: 'Retirer' }];
    case 'DELIVERED':
      return [
        { status: 'IN_INVENTORY', label: 'Remettre dans l’inventaire' },
        { status: 'REVOKED', label: 'Retirer' },
      ];
    case 'REVOKED':
      return [{ status: 'IN_INVENTORY', label: 'Rendre au joueur' }];
    default:
      return [];
  }
}

const CONFIRM: Record<Action, { title: string; button: string }> = {
  DELIVERED: { title: 'Confirmer la livraison', button: 'C’est livré' },
  REVOKED: { title: 'Retirer ce lot au joueur', button: 'Retirer le lot' },
  IN_INVENTORY: { title: 'Remettre dans l’inventaire du joueur', button: 'Remettre' },
};

export const RewardsPanel: React.FC<{ showToast: (msg: string, error?: boolean) => void }> = ({ showToast }) => {
  const { citizens, refreshCitizens, refreshLogs, refreshDashboard } = useCasinoAdmin();

  const [tab, setTab] = useState<Tab>('deliver');
  const [rewards, setRewards] = useState<PlayerReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [pendingNote, setPendingNote] = useState('');
  const [busy, setBusy] = useState(false);

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

  /** Après une action : lots, journal, soldes et compteur du menu */
  const refreshAll = () => Promise.all([load(), refreshLogs(), refreshCitizens(), refreshDashboard()]);

  const claims = useMemo(
    () => rewards.filter((r) => r.status === 'CLAIMED').sort((a, b) => (a.claimed_at || a.created_at).localeCompare(b.claimed_at || b.created_at)),
    [rewards],
  );

  const closePending = () => {
    setPending(null);
    setPendingNote('');
  };

  const runAction = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiAdminUpdateReward(pending.reward.id, pending.status, pendingNote.trim() || undefined);
      const label = pending.reward.label;
      showToast(
        pending.status === 'DELIVERED' ? `« ${label} » livré.` : pending.status === 'REVOKED' ? `« ${label} » retiré au joueur.` : `« ${label} » remis dans l’inventaire.`,
      );
      closePending();
      await refreshAll();
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const playerName = (c?: MockCitizen) => (c ? `${c.rpFirstName} ${c.rpLastName}` : 'Joueur supprimé');

  const counts = useMemo(() => {
    const out: Partial<Record<RewardStatus, number>> = {};
    for (const r of rewards) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }, [rewards]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lots des joueurs"
        subtitle="Ce que les joueurs ont gagné ou reçu, et ce qu'il vous reste à leur remettre en ville."
        actions={
          <Button onClick={() => void load()} loading={loading}>
            <RefreshCw size={13} /> Actualiser
          </Button>
        }
      />

      <LifecycleStrip />

      <div className="overflow-x-auto -mx-1 px-1">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'deliver', label: `À livrer${claims.length ? ` · ${claims.length}` : ''}` },
            { value: 'all', label: 'Tous les lots' },
            { value: 'give', label: 'Offrir un lot' },
            { value: 'catalog', label: 'Catalogue véhicules' },
          ]}
        />
      </div>

      {tab === 'deliver' && (
        <DeliverTab claims={claims} loading={loading} citizenById={citizenById} playerName={playerName} onAction={(reward, status) => setPending({ reward, status })} showToast={showToast} />
      )}

      {tab === 'all' && (
        <AllTab rewards={rewards} counts={counts} loading={loading} citizenById={citizenById} playerName={playerName} onAction={(reward, status) => setPending({ reward, status })} />
      )}

      {tab === 'give' && (
        <GiveTab
          citizens={citizens}
          showToast={showToast}
          onDone={async () => {
            await Promise.all([load(), refreshLogs()]);
          }}
        />
      )}

      {tab === 'catalog' && (
        <CatalogTab
          count={catalogCount}
          setCount={setCatalogCount}
          showToast={showToast}
          onChanged={async () => {
            await Promise.all([load(), refreshLogs()]);
          }}
        />
      )}

      {pending && (
        <Modal title={CONFIRM[pending.status].title} onClose={closePending} width="max-w-md">
          <div className="flex flex-col gap-4">
            <RewardSummary r={pending.reward} player={playerName(citizenById.get(pending.reward.profile_id))} />
            <p className="text-[13px] text-neutral-300">
              {pending.status === 'DELIVERED' &&
                (pending.reward.kind === 'vehicle'
                  ? 'Confirmez une fois le véhicule donné au joueur en jeu. Il apparaîtra dans son garage sur le site.'
                  : 'Confirmez une fois l’objet donné au joueur en jeu.')}
              {pending.status === 'REVOKED' && 'Le lot disparaît de l’inventaire du joueur (erreur, triche…). Vous pourrez le lui rendre plus tard depuis « Tous les lots ».'}
              {pending.status === 'IN_INVENTORY' &&
                (pending.reward.status === 'CLAIMED'
                  ? 'La réclamation est annulée : le lot retourne dans l’inventaire du joueur, qui pourra le réclamer à nouveau ou le revendre.'
                  : 'Le lot retourne dans l’inventaire du joueur.')}
            </p>
            {pending.status === 'IN_INVENTORY' && pending.reward.status === 'DELIVERED' && (
              <p className="text-xs text-amber-200 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                Ce lot a déjà été remis en jeu : il ne pourra plus être revendu contre des jetons (sinon le joueur garderait la voiture en ville ET
                toucherait les jetons). Pensez à récupérer le véhicule en jeu si besoin.
              </p>
            )}
            <Field label="Note (optionnelle)" hint="Visible par le joueur et dans le journal. Ex. : plaque, motif du retrait…">
              <input type="text" value={pendingNote} onChange={(e) => setPendingNote(e.target.value)} maxLength={280} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="subtle" onClick={closePending}>
                Annuler
              </Button>
              <Button variant={pending.status === 'REVOKED' ? 'danger' : 'primary'} onClick={runAction} loading={busy}>
                {CONFIRM[pending.status].button}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Parcours d'un lot
// ---------------------------------------------------------------------------

const LifecycleStrip: React.FC = () => {
  const step = (n: string, title: string, text: string, tone: 'neutral' | 'you' | 'auto' = 'neutral') => (
    <div
      className={cx(
        'flex-1 min-w-[150px] rounded-xl border px-3 py-2.5',
        tone === 'you' ? 'border-sky-400/30 bg-sky-500/[0.06]' : tone === 'auto' ? 'border-white/10 bg-white/[0.02]' : 'border-white/10 bg-white/[0.03]',
      )}
    >
      <div className={cx('text-[10px] font-bold uppercase tracking-wider', tone === 'you' ? 'text-sky-300' : 'text-neutral-500')}>{n}</div>
      <div className="text-[13px] font-semibold text-white mt-0.5">{title}</div>
      <div className="text-[11px] text-neutral-400 leading-snug">{text}</div>
    </div>
  );
  const arrow = <ArrowRight size={14} className="text-neutral-600 shrink-0 self-center hidden md:block" />;
  return (
    <div className="flex flex-col md:flex-row gap-2">
      {step('1', 'Gagné ou offert', 'Roue, booster ou cadeau de la direction.')}
      {arrow}
      {step('2', 'Dans l’inventaire', 'Le joueur le voit dans son Espace membre.')}
      {arrow}
      <div className="flex-[2] flex flex-col sm:flex-row gap-2">
        {step('3 · au choix du joueur', 'Il le revend', 'Contre des jetons. Automatique, rien à faire.', 'auto')}
        {step('3 · au choix du joueur', 'Il le réclame → à vous', 'Remettez-le en jeu puis cliquez « Livré ».', 'you')}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Éléments communs
// ---------------------------------------------------------------------------

const RewardThumb: React.FC<{ r: PlayerReward; className?: string }> = ({ r, className }) => (
  <div className={cx('rounded-lg overflow-hidden bg-neutral-900 shrink-0 flex items-center justify-center text-neutral-600 border border-white/5', className)}>
    {r.image_url ? (
      <img src={r.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
    ) : r.kind === 'vehicle' ? (
      <Car size={18} />
    ) : r.kind === 'pack' ? (
      <Layers size={18} />
    ) : r.kind === 'voucher' ? (
      <Coins size={18} />
    ) : (
      <Gift size={18} />
    )}
  </div>
);

const StatusBadge: React.FC<{ status: RewardStatus }> = ({ status }) => (
  <span className={cx('inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap', REWARD_STATUS[status].className)}>{REWARD_STATUS[status].label}</span>
);

const RewardSummary: React.FC<{ r: PlayerReward; player: string }> = ({ r, player }) => (
  <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-3">
    <RewardThumb r={r} className="w-16 h-10" />
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-white truncate">{r.label}</div>
      <div className="text-[11px] text-neutral-400 truncate">
        {player} · {KIND_LABEL[r.kind]}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Onglet « À livrer »
// ---------------------------------------------------------------------------

const DeliverTab: React.FC<{
  claims: PlayerReward[];
  loading: boolean;
  citizenById: Map<string, MockCitizen>;
  playerName: (c?: MockCitizen) => string;
  onAction: (r: PlayerReward, s: Action) => void;
  showToast: (m: string) => void;
}> = ({ claims, loading, citizenById, playerName, onAction, showToast }) => {
  if (loading && claims.length === 0) {
    return (
      <p className="text-xs text-neutral-500 flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" /> Chargement…
      </p>
    );
  }
  if (claims.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Inbox size={30} />} title="Rien à livrer" hint="Quand un joueur réclame un véhicule ou un objet depuis son inventaire, il apparaît ici." />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-neutral-500">Du plus ancien au plus récent. Donnez le lot au joueur en jeu, puis cliquez « Livré ».</p>
      {claims.map((r) => {
        const c = citizenById.get(r.profile_id);
        return (
          <div key={r.id} className="rounded-2xl bg-neutral-950 border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <RewardThumb r={r} className="w-full sm:w-32 h-20" />
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-white">{r.label}</span>
                <Badge>{KIND_LABEL[r.kind]}</Badge>
              </div>
              <div className="text-[13px] text-neutral-300">
                Pour <b className="text-white">{playerName(c)}</b>
                {c && <span className="font-mono text-neutral-500 text-xs"> #{c.citizenId}</span>}
                {c?.phoneNumber && <span className="text-neutral-500 text-xs"> · tél. {c.phoneNumber}</span>}
              </div>
              <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-x-2">
                {r.vehicle_model && (
                  <button
                    type="button"
                    className="font-mono text-neutral-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                    title="Copier le nom du modèle"
                    onClick={() => {
                      void navigator.clipboard.writeText(r.vehicle_model!);
                      showToast(`Modèle « ${r.vehicle_model} » copié.`);
                    }}
                  >
                    {r.vehicle_model} <Copy size={10} />
                  </button>
                )}
                <span>Réclamé {formatRewardDate(r.claimed_at || r.created_at)}</span>
                <span>· {REWARD_SOURCE[r.source]?.long ?? r.source}</span>
              </div>
              {r.note && <div className="text-[11px] text-neutral-400 italic">« {r.note} »</div>}
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <Button variant="primary" onClick={() => onAction(r, 'DELIVERED')}>
                <PackageCheck size={14} /> Livré
              </Button>
              <div className="flex gap-1">
                <Button size="sm" variant="subtle" onClick={() => onAction(r, 'IN_INVENTORY')} title="Annule la réclamation : le lot retourne dans l’inventaire">
                  <Undo2 size={12} /> Refuser
                </Button>
                <Button size="sm" variant="subtle" className="hover:!text-rose-300" onClick={() => onAction(r, 'REVOKED')}>
                  <X size={12} /> Retirer
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Onglet « Tous les lots »
// ---------------------------------------------------------------------------

const STATUS_ORDER: RewardStatus[] = ['IN_INVENTORY', 'CLAIMED', 'DELIVERED', 'SOLD', 'USED', 'REVOKED'];

const AllTab: React.FC<{
  rewards: PlayerReward[];
  counts: Partial<Record<RewardStatus, number>>;
  loading: boolean;
  citizenById: Map<string, MockCitizen>;
  playerName: (c?: MockCitizen) => string;
  onAction: (r: PlayerReward, s: Action) => void;
}> = ({ rewards, counts, loading, citizenById, playerName, onAction }) => {
  const [status, setStatus] = useState<RewardStatus | 'ALL'>('ALL');
  const [kind, setKind] = useState<PlayerReward['kind'] | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rewards.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (kind !== 'ALL' && r.kind !== kind) return false;
      if (!q) return true;
      const c = citizenById.get(r.profile_id);
      return `${r.label} ${r.vehicle_model ?? ''} ${c ? `${c.rpFirstName} ${c.rpLastName} ${c.citizenId}` : ''}`.toLowerCase().includes(q);
    });
  }, [rewards, status, kind, search, citizenById]);

  return (
    <Card padded={false}>
      <div className="flex flex-col gap-3 p-4 border-b border-white/10">
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', ...STATUS_ORDER] as const).map((s) => {
            const n = s === 'ALL' ? rewards.length : counts[s] ?? 0;
            if (s !== 'ALL' && n === 0) return null;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cx(
                  'h-7 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors',
                  status === s ? 'bg-white text-black border-white' : 'border-white/10 text-neutral-400 hover:text-white',
                )}
              >
                {s === 'ALL' ? 'Tous' : REWARD_STATUS[s].label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Joueur, matricule, lot, modèle…" className={cx(inputClass, 'h-9 pl-8 text-xs')} />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as PlayerReward['kind'] | 'ALL')} className={cx(inputClass, 'h-9 sm:w-44 text-xs cursor-pointer')}>
            <option value="ALL" className="bg-black">
              Tous les types
            </option>
            {(Object.keys(KIND_LABEL) as PlayerReward['kind'][]).map((k) => (
              <option key={k} value={k} className="bg-black">
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && rewards.length === 0 ? (
        <p className="p-5 text-xs text-neutral-500 flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> Chargement…
        </p>
      ) : visible.length === 0 ? (
        <EmptyState title="Aucun lot" hint="Aucun lot ne correspond à ces filtres." />
      ) : (
        <ul className="divide-y divide-white/5 max-h-[640px] overflow-y-auto">
          {visible.map((r) => {
            const c = citizenById.get(r.profile_id);
            const actions = actionsFor(r);
            return (
              <li key={r.id} className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <RewardThumb r={r} className="w-14 h-9" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-white truncate">{r.label}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {playerName(c)}
                      {c && <span className="font-mono"> #{c.citizenId}</span>} · {KIND_LABEL[r.kind]} · {REWARD_SOURCE[r.source]?.short ?? r.source} ·{' '}
                      {formatRewardDate(r.created_at)}
                      {r.status === 'SOLD' && r.sold_for != null && ` · revendu ${fmt(r.sold_for)} ⛁`}
                      {r.handled_by && ` · par ${r.handled_by}`}
                    </div>
                    {r.note && <div className="text-[11px] text-neutral-400 italic truncate">« {r.note} »</div>}
                  </div>
                </div>
                {actions.length > 0 && (
                  <div className="flex flex-wrap gap-1 md:justify-end shrink-0">
                    {actions.map((a) => (
                      <Button
                        key={a.status + a.label}
                        size="sm"
                        variant={a.status === 'DELIVERED' && r.status === 'CLAIMED' ? 'primary' : a.status === 'REVOKED' ? 'danger' : 'ghost'}
                        onClick={() => onAction(r, a.status)}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-4 py-2.5 border-t border-white/10 text-[11px] text-neutral-500">
        Les 300 derniers lots (plus toutes les réclamations en attente). Un lot revendu ou utilisé est terminé : plus aucune action possible.
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Onglet « Offrir un lot »
// ---------------------------------------------------------------------------

const GIFT_KINDS: { id: GiftKind; label: string; hint: string; icon: React.ElementType }[] = [
  { id: 'vehicle', label: 'Véhicule', hint: 'Du catalogue, à réclamer puis livrer en ville', icon: Car },
  { id: 'item', label: 'Objet', hint: 'Nom libre (montre, tenue…), à livrer en ville', icon: Gift },
  { id: 'voucher', label: 'Bonus de machine', hint: 'Bonus gratuit sur Dog House ou Wanted', icon: Coins },
  { id: 'pack', label: 'Boosters', hint: 'À ouvrir sur la page Collections', icon: Layers },
];

const GiveTab: React.FC<{ citizens: MockCitizen[]; showToast: (m: string, error?: boolean) => void; onDone: () => Promise<void> }> = ({ citizens, showToast, onDone }) => {
  const [playerId, setPlayerId] = useState('');
  const [kind, setKind] = useState<GiftKind>('vehicle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [vehicle, setVehicle] = useState<VehicleCatalogEntry | null>(null);
  const [label, setLabel] = useState('');
  const [voucherGame, setVoucherGame] = useState<'doghouse' | 'wanted'>('doghouse');
  const [voucherBuy, setVoucherBuy] = useState<'gtr' | 'duel' | 'dmh'>('gtr');
  const [voucherValue, setVoucherValue] = useState(20000);
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

  const player = citizens.find((c) => c.profileId === playerId);
  const ready =
    !!player &&
    (kind === 'vehicle' ? !!vehicle : kind === 'item' ? !!label.trim() : kind === 'voucher' ? voucherValue >= 1 : packSets.length > 0 && packQty >= 1);

  const summary =
    kind === 'vehicle'
      ? vehicle
        ? label.trim() || vehicleDisplayName(vehicle.manufacturer, vehicle.model)
        : 'un véhicule'
      : kind === 'item'
        ? label.trim() || 'un objet'
        : kind === 'voucher'
          ? `un bonus ${voucherGame === 'wanted' ? 'Wanted' : 'Dog House'} de ${fmt(voucherValue)} ⛁`
          : `${packQty} booster(s) ${packSets.find((p) => p.id === packSet)?.name ?? ''}`;

  const give = async () => {
    if (!player) return;
    setBusy(true);
    try {
      const n = note.trim() || undefined;
      if (kind === 'vehicle' || kind === 'item') {
        await apiAdminGrantReward(player.profileId, { vehicleModel: kind === 'vehicle' ? vehicle?.model : undefined, label: label.trim() || undefined, note: n });
      } else if (kind === 'voucher') {
        await apiAdminGrantVoucher(player.profileId, { game: voucherGame, buy: voucherGame === 'wanted' ? voucherBuy : 'buy', value: Math.floor(voucherValue), note: n });
      } else {
        await apiAdminGrantCollectionPack(player.profileId, packSet, Math.min(50, Math.max(1, Math.floor(packQty) || 1)), n);
      }
      showToast(`${summary} offert à ${player.rpFirstName} ${player.rpLastName}.`);
      setVehicle(null);
      setLabel('');
      setNote('');
      await onDone();
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-6 max-w-3xl">
        <Field label="1. À quel joueur ?">
          <PlayerPicker citizens={citizens} value={playerId} onChange={setPlayerId} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-neutral-400">2. Quoi ?</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {GIFT_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cx(
                  'text-left rounded-xl border p-3 cursor-pointer transition-colors',
                  kind === k.id ? 'bg-white text-black border-white' : 'border-white/10 text-neutral-300 hover:bg-white/5',
                )}
              >
                <k.icon size={16} className={kind === k.id ? 'text-black' : 'text-neutral-500'} />
                <div className="text-[13px] font-semibold mt-1.5">{k.label}</div>
                <div className={cx('text-[11px] leading-snug', kind === k.id ? 'text-black/60' : 'text-neutral-500')}>{k.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-medium text-neutral-400">3. Détails</span>
          {kind === 'vehicle' && (
            <>
              <VehiclePicker selectedModel={vehicle?.model} onSelect={setVehicle} className="max-h-60" />
              {vehicle && (
                <p className="text-xs text-white flex items-center gap-2">
                  <Check size={13} /> {vehicleDisplayName(vehicle.manufacturer, vehicle.model)} · {fmt(vehicle.price ?? 0)} $
                </p>
              )}
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Nom affiché (optionnel)" className={inputClass} />
            </>
          )}
          {kind === 'item' && (
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Nom de l’objet, ex. : Montre Vacheron Royale" className={inputClass} />
          )}
          {kind === 'voucher' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Machine">
                <select value={voucherGame} onChange={(e) => setVoucherGame(e.target.value as 'doghouse' | 'wanted')} className={cx(inputClass, 'cursor-pointer')}>
                  <option value="doghouse" className="bg-black">
                    The Dog House
                  </option>
                  <option value="wanted" className="bg-black">
                    Wanted
                  </option>
                </select>
              </Field>
              <Field label="Bonus">
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
              </Field>
              <Field label="Valeur" hint="La mise est déduite de cette valeur.">
                <NumberInput value={voucherValue} min={1} onChange={setVoucherValue} suffix="⛁" />
              </Field>
            </div>
          )}
          {kind === 'pack' && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Album">
                <select value={packSet} onChange={(e) => setPackSet(e.target.value)} className={cx(inputClass, 'cursor-pointer')}>
                  {packSets.map((x) => (
                    <option key={x.id} value={x.id} className="bg-black">
                      {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre (1 à 50)">
                <NumberInput value={packQty} min={1} max={50} onChange={setPackQty} suffix="×" />
              </Field>
            </div>
          )}
        </div>

        <Field label="Note (optionnelle, visible par le joueur)">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Ex. : gagnant de l’événement du samedi" className={inputClass} />
        </Field>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-white/10">
          <span className="text-[13px] text-neutral-400">
            {player ? (
              <>
                Offrir <b className="text-white">{summary}</b> à <b className="text-white">{player.rpFirstName} {player.rpLastName}</b>.
              </>
            ) : (
              'Choisissez d’abord un joueur.'
            )}
          </span>
          <Button variant="primary" onClick={give} loading={busy} disabled={!ready}>
            <Gift size={13} /> Offrir
          </Button>
        </div>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Onglet « Catalogue véhicules »
// ---------------------------------------------------------------------------

const CatalogTab: React.FC<{
  count: number | null;
  setCount: (n: number) => void;
  showToast: (m: string, error?: boolean) => void;
  onChanged: () => Promise<void>;
}> = ({ count, setCount, showToast, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [vehicle, setVehicle] = useState<VehicleCatalogEntry | null>(null);
  const [price, setPrice] = useState('');
  const [updateInventory, setUpdateInventory] = useState(true);
  const [pickerReload, setPickerReload] = useState(0);

  const importRows = async (raw: unknown) => {
    const rows = normalizeVehicleImport(raw);
    if (rows.length === 0) throw new Error('Aucun véhicule trouvé dans le fichier.');
    setProgress({ done: 0, total: rows.length });
    const n = await apiAdminImportVehicles(rows, (done) => setProgress({ done, total: rows.length }));
    showToast(`${fmt(n)} véhicules importés / mis à jour.`);
    setCount(await dbCountVehicles());
    setPickerReload((k) => k + 1);
    await onChanged();
  };

  const runImport = async (getRaw: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await importRows(await getRaw());
    } catch (err) {
      showToast(err instanceof SyntaxError ? 'Le fichier n’est pas un JSON valide.' : (err as Error).message, true);
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const savePrice = async () => {
    if (!vehicle) return;
    const value = Number(price.replace(/[\s .,]/g, ''));
    if (!Number.isFinite(value) || value < 0) {
      showToast('Prix invalide.', true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiAdminSetVehiclePrice(vehicle.model, value, updateInventory);
      showToast(
        `${vehicleDisplayName(vehicle.manufacturer, vehicle.model)} : ${fmt(res.old_price)} → ${fmt(res.price)}` +
          (updateInventory ? ` (${res.updated_rewards} lot(s) en inventaire mis à jour)` : ''),
      );
      setVehicle({ ...vehicle, price: res.price, price_locked: true });
      setPickerReload((k) => k + 1);
      await onChanged();
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
      <Card title="Importer des véhicules" icon={<Download size={15} />}>
        <div className="flex flex-col gap-4">
          <p className="text-3xl font-bold font-mono text-white">
            {count === null ? '…' : fmt(count)}
            <span className="text-sm font-normal text-neutral-500"> véhicules</span>
          </p>
          <p className="text-xs text-neutral-400">
            La liste des véhicules utilisables pour la roue, les dons et les collections. L’import met à jour les véhicules existants et ajoute les
            nouveaux (format JSON du panel CTG accepté tel quel). Les prix corrigés à la main ne sont pas écrasés.
          </p>
          {progress && (
            <div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-white transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <p className="text-[11px] font-mono text-neutral-500 mt-1">
                {progress.done} / {progress.total}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button
              onClick={() =>
                void runImport(async () => {
                  const res = await fetch('/data/ctg_vehicles.json');
                  if (!res.ok) throw new Error(`Catalogue introuvable (HTTP ${res.status})`);
                  return res.json();
                })
              }
              disabled={busy}
            >
              <RefreshCw size={13} /> Réimporter le catalogue CTG
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={13} /> Importer un fichier JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 20 * 1024 * 1024) {
                  showToast('Fichier trop volumineux (20 Mo maximum).', true);
                  return;
                }
                void runImport(async () => JSON.parse(await f.text()));
              }}
            />
          </div>
        </div>
      </Card>

      <Card title="Corriger le prix d’un véhicule" icon={<Lock size={15} />}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-neutral-400">
            Le prix sert de valeur partout : roue (lots et podium), collections, revente. Un prix corrigé ici est protégé des prochains imports.
          </p>
          <VehiclePicker
            selectedModel={vehicle?.model}
            onSelect={(v) => {
              setVehicle(v);
              setPrice(String(v.price ?? 0));
            }}
            className="max-h-52"
            reloadKey={pickerReload}
          />
          {vehicle ? (
            <div className="flex flex-col gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <p className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
                {vehicleDisplayName(vehicle.manufacturer, vehicle.model)}
                <span className="text-[11px] font-mono text-neutral-500">{vehicle.model}</span>
                {vehicle.price_locked && (
                  <span className="text-[10px] text-amber-300 flex items-center gap-1" title="Prix corrigé à la main, ignoré par l’import">
                    <Lock size={10} /> corrigé
                  </span>
                )}
              </p>
              <Field label={`Nouveau prix (actuel : ${fmt(vehicle.price ?? 0)} $)`}>
                <input type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={cx(inputClass, 'font-mono')} />
              </Field>
              <label className="flex items-start gap-2 text-xs text-neutral-300 cursor-pointer">
                <input type="checkbox" checked={updateInventory} onChange={(e) => setUpdateInventory(e.target.checked)} className="mt-0.5" />
                Appliquer aussi aux exemplaires déjà gagnés, encore dans les inventaires (valeur de revente)
              </label>
              <Button variant="primary" className="self-end" onClick={savePrice} loading={busy} disabled={price.trim() === ''}>
                Enregistrer le prix
              </Button>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">Choisissez un véhicule dans la liste.</p>
          )}
        </div>
      </Card>
    </div>
  );
};
