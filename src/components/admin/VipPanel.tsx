import React, { useEffect, useState } from 'react';
import { Check, Crown, X } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import type { VipConfig } from '../../lib/gamesConfig';
import { Badge, Button, Card, EmptyState, Field, HelpBox, NumberInput, PageHeader, SaveBar, VipBadge, fmt, fmtDate } from './ui';

const TIERS = ['SILVER', 'GOLD', 'DIAMOND'] as const;

export const VipPanel: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const { vipConfig, saveVipConfig, vipRequests, setCitizenVip, rejectVipRequest, citizens, wheelCooldownHours } = useCasinoAdmin();
  const [draft, setDraft] = useState<VipConfig>(vipConfig);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setDraft(vipConfig), [vipConfig]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(vipConfig);
  const members = citizens.filter((c) => c.vipTier).sort((a, b) => (a.vipExpiresAt || '').localeCompare(b.vipExpiresAt || ''));

  const save = async () => {
    setSaving(true);
    const ok = await saveVipConfig(draft);
    setSaving(false);
    if (ok) showToast('Offres VIP enregistrées.');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="VIP" subtitle="Demandes d'abonnement à valider, membres VIP actifs et réglage des trois cartes." />

      <Card title={`Demandes en attente (${vipRequests.length})`} icon={<Crown size={15} />} padded={false}>
        {vipRequests.length === 0 ? (
          <EmptyState title="Aucune demande en attente" hint="Quand un joueur demande une carte payée en euros, elle apparaît ici." />
        ) : (
          <ul className="divide-y divide-white/5">
            {vipRequests.map((r) => (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3">
                <div className="text-[13px]">
                  <span className="font-semibold text-white">{r.citizen ? `${r.citizen.rpFirstName} ${r.citizen.rpLastName}` : 'Joueur'}</span>{' '}
                  <span className="font-mono text-neutral-500">#{r.citizen?.citizenId ?? '?'}</span> demande <VipBadge tier={r.tier} />
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    le {fmtDate(r.createdAt)} · à la validation : +{fmt(vipConfig[r.tier].bonus)} jetons offerts, carte valable {vipConfig.durationDays} jours
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busyId === r.id}
                    onClick={async () => {
                      setBusyId(r.id);
                      if (await setCitizenVip(r.profileId, r.tier, true)) showToast(`VIP ${r.tier} activé.`);
                      setBusyId(null);
                    }}
                  >
                    <Check size={12} /> Paiement reçu, valider
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      setBusyId(r.id);
                      if (await rejectVipRequest(r.id)) showToast('Demande refusée.');
                      setBusyId(null);
                    }}
                  >
                    <X size={12} /> Refuser
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="sticky top-0 z-20">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setDraft(vipConfig)} />
      </div>

      <Card title="Les cartes VIP">
        <div className="flex flex-col gap-5">
          <Field label="Durée d'une carte" hint="Après cette durée, le VIP expire automatiquement. Le joueur peut en racheter une.">
            <div className="max-w-[200px]">
              <NumberInput value={draft.durationDays} min={1} max={365} onChange={(v) => setDraft({ ...draft, durationDays: v })} suffix="jours" />
            </div>
          </Field>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {TIERS.map((t) => {
              const c = draft[t];
              const net = c.price - c.bonus;
              return (
                <div key={t} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex flex-col gap-3">
                  <VipBadge tier={t} />
                  <Field label="Prix (achat avec jetons)">
                    <NumberInput value={c.price} min={0} onChange={(v) => setDraft({ ...draft, [t]: { ...c, price: v } })} suffix="⛁" />
                  </Field>
                  <Field label="Jetons offerts à l'activation">
                    <NumberInput value={c.bonus} min={0} onChange={(v) => setDraft({ ...draft, [t]: { ...c, bonus: v } })} suffix="⛁" />
                  </Field>
                  <Field label="Délai de la roue" hint={`Utilisé s'il est plus court que le délai standard (${wheelCooldownHours} h).`}>
                    <NumberInput value={c.wheelCooldownHours} min={1} max={168} onChange={(v) => setDraft({ ...draft, [t]: { ...c, wheelCooldownHours: v } })} suffix="h" />
                  </Field>
                  <div className="text-[11px] text-neutral-400">
                    Coût réel pour le joueur :{' '}
                    <b className={net < 0 ? 'text-rose-300' : 'text-white'}>
                      {fmt(net)} jetons{net < 0 && ' (il GAGNE des jetons en l’achetant !)'}
                    </b>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card title={`Membres VIP actifs (${members.length})`} padded={false}>
        {members.length === 0 ? (
          <EmptyState title="Aucun VIP actif" />
        ) : (
          <ul className="divide-y divide-white/5">
            {members.map((c) => (
              <li key={c.profileId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                <span className="text-white font-semibold">
                  {c.rpFirstName} {c.rpLastName} <span className="font-mono text-neutral-500 text-xs">#{c.citizenId}</span>
                </span>
                <span className="flex items-center gap-2">
                  <VipBadge tier={c.vipTier} />
                  <Badge>{c.vipExpiresAt ? `expire le ${fmtDate(c.vipExpiresAt, false)}` : 'sans date'}</Badge>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={async () => {
                      if (window.confirm(`Retirer le VIP de ${c.rpFirstName} ${c.rpLastName} ?`) && (await setCitizenVip(c.profileId, null, false))) {
                        showToast('VIP retiré.');
                      }
                    }}
                  >
                    Retirer
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <HelpBox title="Comment fonctionne le VIP ?">
        <p>
          Deux façons d'obtenir une carte : <b>l'acheter avec ses jetons</b> depuis la page Abonnements (automatique, le prix est
          débité et les jetons offerts crédités), ou <b>la demander en payant en euros</b> : la demande arrive ici et c'est vous qui
          validez une fois le paiement reçu.
        </p>
        <p>
          Avantages : jetons offerts à l'activation et délai de roue plus court. La carte dure {vipConfig.durationDays} jours puis expire
          toute seule. Changer de carte ne remet plus le délai de la roue à zéro (c'était une faille : on pouvait tourner la roue en
          boucle).
        </p>
      </HelpBox>
    </div>
  );
};
