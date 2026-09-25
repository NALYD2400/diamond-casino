import React, { useMemo, useState } from 'react';
import { Coins, Copy, ExternalLink, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { useCasinoAdmin, type MockCitizen } from '../../context/CasinoAdminContext';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { getDefaultDiscordAvatar } from '../../lib/discord';
import { CitizenProfileSheet } from '../CitizenProfileSheet';
import { Badge, Button, EmptyState, Field, HelpBox, Modal, NumberInput, PageHeader, RoleBadge, Segmented, VipBadge, cx, fmt, fmtDate, inputClass } from './ui';

type Filter = 'all' | 'members' | 'staff' | 'vip' | 'unlinked';
type Sort = 'recent' | 'chips' | 'wagered' | 'name';

export const PlayersPanel: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const {
    citizens,
    refreshCitizens,
    updateCitizen,
    adjustCitizenBalance,
    resetCitizenWheelCooldown,
    deleteCitizen,
    logs,
    addLog,
  } = useCasinoAdmin();
  const { user } = useCasinoUser();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<MockCitizen | null>(null);
  const [money, setMoney] = useState<MockCitizen | null>(null);
  const [deleting, setDeleting] = useState<MockCitizen | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = citizens.filter((c) => {
      if (filter === 'members' && c.role !== 'MEMBRE') return false;
      if (filter === 'staff' && c.role === 'MEMBRE') return false;
      if (filter === 'vip' && !c.vipTier) return false;
      if (filter === 'unlinked' && c.isLinked) return false;
      if (!q) return true;
      return [c.citizenId, c.rpFirstName, c.rpLastName, c.discordTag, c.discordId, c.phoneNumber]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    const by: Record<Sort, (a: MockCitizen, b: MockCitizen) => number> = {
      recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
      chips: (a, b) => b.chips - a.chips,
      wagered: (a, b) => (b.totalWagered || 0) - (a.totalWagered || 0),
      name: (a, b) => `${a.rpFirstName} ${a.rpLastName}`.localeCompare(`${b.rpFirstName} ${b.rpLastName}`),
    };
    return rows.sort(by[sort]);
  }, [citizens, query, filter, sort]);

  const counts = {
    all: citizens.length,
    members: citizens.filter((c) => c.role === 'MEMBRE').length,
    staff: citizens.filter((c) => c.role !== 'MEMBRE').length,
    vip: citizens.filter((c) => c.vipTier).length,
    unlinked: citizens.filter((c) => !c.isLinked).length,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Joueurs"
        subtitle="Tous les comptes du casino. Cliquez sur une ligne pour ouvrir la fiche complète (historique, notes, rôle, VIP…)."
        actions={
          <Button
            loading={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await refreshCitizens();
              setRefreshing(false);
            }}
          >
            <RefreshCw size={13} /> Actualiser
          </Button>
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            className={cx(inputClass, 'pl-9')}
            placeholder="Nom RP, matricule, pseudo Discord, téléphone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Tous ${counts.all}` },
              { value: 'members', label: `Membres ${counts.members}` },
              { value: 'staff', label: `Staff ${counts.staff}` },
              { value: 'vip', label: `VIP ${counts.vip}` },
              { value: 'unlinked', label: `Non liés ${counts.unlinked}` },
            ]}
          />
          <select className={cx(inputClass, 'w-auto h-9 text-xs cursor-pointer')} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent" className="bg-black">Plus récents</option>
            <option value="chips" className="bg-black">Plus riches</option>
            <option value="wagered" className="bg-black">Plus gros joueurs</option>
            <option value="name" className="bg-black">Nom (A→Z)</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-neutral-950 border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10 bg-white/[0.02]">
                <th className="px-5 py-3 font-medium">Joueur</th>
                <th className="px-3 py-3 font-medium">Discord</th>
                <th className="px-3 py-3 font-medium">Statut</th>
                <th className="px-3 py-3 font-medium text-right">Solde</th>
                <th className="px-3 py-3 font-medium text-right">Total misé</th>
                <th className="px-3 py-3 font-medium">Roue</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={<Users size={30} />} title="Aucun joueur trouvé" hint="Modifiez la recherche ou le filtre." />
                  </td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.profileId} className="hover:bg-white/[0.03] cursor-pointer" onClick={() => setEditing(c)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={c.avatarUrl || getDefaultDiscordAvatar(c.discordId || c.profileId)}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover bg-neutral-900 border border-white/10 shrink-0"
                          onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate flex items-center gap-1.5">
                            {c.rpFirstName} {c.rpLastName}
                            {c.adminNote && <Badge tone="warn">Note</Badge>}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono">
                            #{c.citizenId} · inscrit le {fmtDate(c.createdAt, false)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {c.isLinked ? (
                        <div className="flex items-center gap-1.5 text-[12px] text-neutral-300">
                          <span className="truncate max-w-[140px]">{c.discordTag || c.discordId || 'Lié'}</span>
                          {c.discordId && (
                            <button
                              type="button"
                              title="Copier l'ID Discord"
                              className="text-neutral-500 hover:text-white cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                void navigator.clipboard.writeText(c.discordId!);
                                showToast('ID Discord copié');
                              }}
                            >
                              <Copy size={12} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <Badge tone="warn">Pas encore connecté</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <RoleBadge role={c.role} />
                        <VipBadge tier={c.vipTier} />
                      </div>
                      {c.vipExpiresAt && <div className="text-[10px] text-neutral-500 mt-1">VIP jusqu'au {fmtDate(c.vipExpiresAt, false)}</div>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-amber-300 font-semibold">{fmt(c.chips)}</td>
                    <td className="px-3 py-3 text-right font-mono text-neutral-400">{fmt(c.totalWagered)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={c.wheelCooldownRemaining === 'Disponible' ? 'good' : 'neutral'}>
                        {c.wheelCooldownRemaining === 'Disponible' ? 'Disponible' : 'En attente'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => setMoney(c)} title="Ajouter / retirer des jetons">
                          <Coins size={12} /> ±
                        </Button>
                        <Button size="sm" onClick={() => setEditing(c)} title="Ouvrir la fiche">
                          <ExternalLink size={12} />
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleting(c)} title="Supprimer le compte" disabled={c.profileId === user?.id}>
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <HelpBox title="Qui peut faire quoi ?">
        <p>
          <b>Directeur casino</b> : gère les membres (soldes, VIP, notes, lots) mais ne peut pas toucher aux fiches des développeurs et
          fondateurs, ni changer les rôles. <b>Développeur</b> : peut en plus changer les rôles (sauf Fondateur). <b>Fondateur</b> : tous
          les droits. Ces règles sont vérifiées par le serveur.
        </p>
        <p>
          « <b>Pas encore connecté</b> » = fiche créée mais le joueur ne s'est jamais connecté avec Discord ; elle sera liée
          automatiquement à sa première connexion. Chaque modification de solde est enregistrée dans l'historique du joueur et dans le
          Journal.
        </p>
      </HelpBox>

      {money && <MoneyModal citizen={money} onClose={() => setMoney(null)} onDone={showToast} adjust={adjustCitizenBalance} />}

      {deleting && (
        <Modal title="Supprimer ce compte ?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-neutral-300">
            La fiche de <b className="text-white">{deleting.rpFirstName} {deleting.rpLastName}</b> (#{deleting.citizenId}) et son solde de{' '}
            <b className="text-amber-300">{fmt(deleting.chips)} jetons</b> seront supprimés définitivement. Son historique de parties est
            conservé de façon anonyme.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="subtle" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (await deleteCitizen(deleting.profileId)) showToast('Compte supprimé.');
                setDeleting(null);
              }}
            >
              Supprimer définitivement
            </Button>
          </div>
        </Modal>
      )}

      {editing && (
        <CitizenProfileSheet
          citizen={citizens.find((c) => c.profileId === editing.profileId) ?? editing}
          onClose={() => setEditing(null)}
          onSave={async (updated) => {
            if (await updateCitizen(editing.profileId, updated)) {
              showToast(`Fiche de ${updated.rpFirstName} ${updated.rpLastName} enregistrée.`);
              setEditing(null);
            }
          }}
          onUpdateLive={(updated) => void updateCitizen(editing.profileId, updated)}
          onResetCooldown={() => resetCitizenWheelCooldown(editing.profileId)}
          onAdjustBalance={(delta, reason) => adjustCitizenBalance(editing.profileId, delta, reason)}
          adminLogs={logs}
          onAddLog={addLog}
          showToast={showToast}
          currentUser={user}
        />
      )}
    </div>
  );
};

const MoneyModal: React.FC<{
  citizen: MockCitizen;
  onClose: () => void;
  onDone: (m: string) => void;
  adjust: (id: string, delta: number, reason?: string) => Promise<boolean>;
}> = ({ citizen, onClose, onDone, adjust }) => {
  const [op, setOp] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const delta = (op === 'add' ? 1 : -1) * Math.max(0, Math.trunc(amount));
  const after = Math.max(0, citizen.chips + delta);

  const submit = async () => {
    if (!delta) return;
    if (!reason.trim()) {
      onDone('Indiquez un motif (il apparaît dans l’historique du joueur).');
      return;
    }
    setBusy(true);
    const ok = await adjust(citizen.profileId, delta, reason.trim());
    setBusy(false);
    if (ok) {
      onDone(`${delta > 0 ? '+' : ''}${fmt(delta)} jetons pour ${citizen.rpFirstName} ${citizen.rpLastName}.`);
      onClose();
    }
  };

  return (
    <Modal title={`Solde de ${citizen.rpFirstName} ${citizen.rpLastName}`} onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
          <span className="text-xs text-neutral-400">Solde actuel</span>
          <span className="font-mono text-lg font-bold text-amber-300">{fmt(citizen.chips)} ⛁</span>
        </div>
        <Segmented
          value={op}
          onChange={setOp}
          options={[
            { value: 'add', label: 'Ajouter' },
            { value: 'remove', label: 'Retirer' },
          ]}
        />
        <Field label="Montant">
          <NumberInput value={amount} min={0} onChange={setAmount} suffix="⛁" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[1000, 10000, 50000, 100000, 500000].map((v) => (
            <Button key={v} size="sm" onClick={() => setAmount(v)}>
              {fmt(v)}
            </Button>
          ))}
        </div>
        <Field label="Motif (obligatoire)" hint="Visible dans l'historique du joueur et dans le journal.">
          <input className={inputClass} maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : remboursement bug, gain d'événement…" />
        </Field>
        <div className="text-[13px] text-neutral-400">
          Nouveau solde : <b className="font-mono text-white">{fmt(after)} ⛁</b>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!delta}>
            Confirmer
          </Button>
        </div>
      </div>
    </Modal>
  );
};
