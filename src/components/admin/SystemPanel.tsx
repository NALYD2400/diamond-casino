import React, { useEffect, useState } from 'react';
import { Activity, Coins, Lock, RefreshCw, ShieldCheck, Unlock } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { dbCheckHealth, type SupabaseHealthResult } from '../../lib/supabase';
import { Badge, Button, Card, Field, HelpBox, NumberInput, PageHeader, Toggle, fmt, inputClass } from './ui';

const SECURITY_POINTS = [
  ['Tirages des jeux', 'Mines, Dog House, Wanted et la roue sont tirés par le serveur avec un aléa cryptographique. Le navigateur ne fait qu’afficher.'],
  ['Soldes', 'Aucune écriture directe possible : chaque mouvement de jetons passe par une fonction serveur qui vérifie le solde et l’enregistre dans l’historique.'],
  ['Réglages', 'Validés et bornés par le serveur (mises, RTP, prix, chances…). Une valeur absurde est corrigée ou refusée.'],
  ['Droits', 'Le rôle est vérifié côté serveur à chaque action. Un directeur ne peut pas modifier un fondateur ou un développeur.'],
  ['Journal', 'Écrit uniquement par le serveur, avec le nom réel de l’auteur. Personne ne peut le modifier ni le vider depuis le site.'],
  ['Mines', 'La grille reste secrète en base jusqu’à la fin de la manche. Fermer l’onglet ne rembourse plus la mise.'],
] as const;

export const SystemPanel: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const { economy, setMaintenance, adjustCitizenBalance, resetCitizenWheelCooldown, reloadConfig } = useCasinoAdmin();
  const { user, refreshProfile } = useCasinoUser();
  const [message, setMessage] = useState(economy.maintenanceMessage);
  const [health, setHealth] = useState<SupabaseHealthResult | null>(null);
  const [pinging, setPinging] = useState(false);
  const [devAmount, setDevAmount] = useState(50000);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMessage(economy.maintenanceMessage), [economy.maintenanceMessage]);

  const ping = async () => {
    setPinging(true);
    setHealth(await dbCheckHealth());
    setPinging(false);
  };
  useEffect(() => {
    void ping();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Système" subtitle="Ouverture du casino, état du serveur et outils de test pour le staff." />

      <Card
        title="Maintenance"
        icon={economy.maintenanceMode ? <Lock size={15} /> : <Unlock size={15} />}
        right={<Badge tone={economy.maintenanceMode ? 'bad' : 'good'}>{economy.maintenanceMode ? 'Casino fermé' : 'Casino ouvert'}</Badge>}
      >
        <div className="flex flex-col gap-4">
          <Toggle
            checked={economy.maintenanceMode}
            label="Mode maintenance"
            hint="Ferme TOUS les jeux et la roue d'un coup (vérifié par le serveur). Les joueurs gardent leurs jetons ; une manche de Mines en cours pourra être terminée à la réouverture."
            onChange={async (v) => {
              if (await setMaintenance(v, message)) showToast(v ? 'Casino fermé (maintenance).' : 'Casino rouvert.');
            }}
          />
          <Field label="Message affiché aux joueurs">
            <div className="flex gap-2">
              <input className={inputClass} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} />
              <Button
                disabled={message === economy.maintenanceMessage}
                onClick={async () => {
                  if (await setMaintenance(economy.maintenanceMode, message)) showToast('Message enregistré.');
                }}
              >
                Enregistrer
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="État du serveur"
          icon={<Activity size={15} />}
          right={
            <Button size="sm" onClick={ping} loading={pinging}>
              <RefreshCw size={12} /> Tester
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="text-[11px] text-neutral-500">Base de données</div>
              <div className={health?.online ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {health ? (health.online ? 'En ligne' : `Hors ligne (${health.error})`) : '…'}
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="text-[11px] text-neutral-500">Temps de réponse</div>
              <div className="font-mono text-white">{health ? `${health.latencyMs} ms` : '…'}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 col-span-2">
              <div className="text-[11px] text-neutral-500">Votre compte</div>
              <div className="text-white">
                {user?.rpFirstName} {user?.rpLastName} · {user?.role} · Discord {user?.isDiscordSynced ? 'lié' : 'non lié'}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Button size="sm" variant="subtle" onClick={() => void reloadConfig().then(() => showToast('Réglages rechargés depuis le serveur.'))}>
              Recharger les réglages
            </Button>
          </div>
        </Card>

        <Card title="Outils de test (votre compte)" icon={<Coins size={15} />}>
          <div className="flex flex-col gap-4">
            <p className="text-[12px] text-neutral-400">
              Pour tester les jeux avec de vrais jetons. Chaque crédit est tracé dans le journal à votre nom, comme n'importe quel
              ajustement.
            </p>
            <Field label={`Créditer mon compte (solde actuel : ${fmt(user?.chips)} jetons)`}>
              <div className="flex gap-2">
                <NumberInput value={devAmount} min={1} onChange={setDevAmount} suffix="⛁" />
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={async () => {
                    if (!user || devAmount <= 0) return;
                    setBusy(true);
                    if (await adjustCitizenBalance(user.id, devAmount, 'Crédit de test (staff)')) showToast(`+${fmt(devAmount)} jetons.`);
                    setBusy(false);
                  }}
                >
                  Créditer
                </Button>
              </div>
            </Field>
            <Button
              onClick={async () => {
                if (user && (await resetCitizenWheelCooldown(user.id))) {
                  await refreshProfile();
                  showToast('Vous pouvez retourner la roue.');
                }
              }}
            >
              Débloquer ma roue maintenant
            </Button>
          </div>
        </Card>
      </div>

      <Card title="Ce qui protège le casino" icon={<ShieldCheck size={15} />}>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SECURITY_POINTS.map(([title, text]) => (
            <li key={title} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="text-[13px] font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-400" /> {title}
              </div>
              <p className="text-[12px] text-neutral-400 mt-1">{text}</p>
            </li>
          ))}
        </ul>
      </Card>

      <HelpBox title="Mettre à jour les machines à sous">
        <p>
          Les tirages de Dog House et Wanted sont faits par la fonction serveur <code>slot-round</code> (Supabase Edge Function). Si vous
          modifiez un moteur de jeu dans le code, lancez <code>npm run sync:edge</code> puis redéployez la fonction, sinon le serveur
          continue d'utiliser l'ancienne version.
        </p>
      </HelpBox>
    </div>
  );
};
