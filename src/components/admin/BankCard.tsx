import React, { useEffect, useState } from 'react';
import { Gem, Landmark, Save } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { apiAdminBankUpdate, type CasinoBank } from '../../lib/supabase';
import { refreshCasinoLimits } from '../../lib/casinoLimits';
import type { BankConfig } from '../../lib/gamesConfig';
import { Badge, Button, Card, Field, HelpBox, NumberInput, Stat, cx, fmt, fmtChips, inputClass } from './ui';

/**
 * Caisse du casino : une seule réserve paie tous les jeux (comme la caisse d'un vrai casino).
 * Gain max d'une manche = maxWinPct de la caisse ; au-dessus de son plus haut niveau, keepPct du
 * bénéfice reste dans la caisse (le gain max monte), le reste revient à la direction.
 */
export const BankCard: React.FC<{ bank: CasinoBank | null | undefined }> = ({ bank }) => {
  const { gamesConfig, saveGamesConfig, refreshDashboard } = useCasinoAdmin();
  const { user } = useCasinoUser();
  const canManage = user?.role === 'FONDATEUR' || user?.role === 'DÉVELOPPEUR';

  const [amount, setAmount] = useState(1000000);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; bad?: boolean } | null>(null);
  const [draft, setDraft] = useState<BankConfig>(gamesConfig.bank);
  useEffect(() => setDraft(gamesConfig.bank), [gamesConfig.bank]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(gamesConfig.bank);

  if (!bank) {
    return (
      <Card title="Caisse du casino" icon={<Landmark size={15} />}>
        <p className="text-[13px] text-neutral-400">
          La caisse n'est pas encore active sur la base de données (migration <code>casino_bank_and_jackpot</code> à appliquer).
        </p>
      </Card>
    );
  }

  const act = async (action: 'deposit' | 'withdraw' | 'collect') => {
    if (action === 'collect' && !window.confirm(`Marquer ${fmt(bank.owner_total)} jetons de bénéfice comme récupérés par la direction ?`)) return;
    setBusy(action);
    setFeedback(null);
    try {
      await apiAdminBankUpdate(action, action === 'collect' ? 0 : amount, reason);
      setReason('');
      setFeedback({
        text:
          action === 'deposit'
            ? `Caisse rechargée de ${fmt(amount)} jetons.`
            : action === 'withdraw'
              ? `${fmt(amount)} jetons retirés de la caisse.`
              : 'Bénéfice marqué comme récupéré.',
      });
      await Promise.all([refreshDashboard(), refreshCasinoLimits(true)]);
    } catch (e) {
      setFeedback({ text: (e as Error).message, bad: true });
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    setBusy('settings');
    setFeedback(null);
    const ok = await saveGamesConfig({ ...gamesConfig, bank: draft });
    setFeedback(ok ? { text: 'Réglages de la caisse enregistrés.' } : { text: 'Réglages refusés par le serveur.', bad: true });
    if (ok) await Promise.all([refreshDashboard(), refreshCasinoLimits(true)]);
    setBusy(null);
  };

  const low = bank.balance < bank.start_amount * 0.5;

  return (
    <Card
      title="Caisse du casino"
      icon={<Landmark size={15} />}
      right={bank.balance <= 0 ? <Badge tone="bad">Vide : jeux fermés</Badge> : low ? <Badge tone="warn">Sous la moitié du départ</Badge> : <Badge tone="good">Ouverte</Badge>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label="Caisse"
          value={fmtChips(bank.balance)}
          tone={bank.balance <= 0 ? 'bad' : 'default'}
          hint={`Départ ${fmt(bank.start_amount)} · plus haut ${fmt(bank.peak)}`}
        />
        <Stat
          label="Gain max par manche"
          value={fmtChips(bank.max_win)}
          hint={`${fmt(gamesConfig.bank.maxWinPct)} % de la caisse : monte quand la caisse grossit`}
        />
        <Stat
          label="Bénéfice de la direction"
          value={fmtChips(bank.owner_total)}
          tone={bank.owner_total > 0 ? 'good' : 'default'}
          hint={`${fmt(100 - gamesConfig.bank.keepPct)} % des nouveaux bénéfices, depuis la dernière récupération`}
        />
        <Stat
          label="Jackpot progressif"
          value={fmtChips(bank.jackpot)}
          icon={<Gem size={16} />}
          hint={
            bank.jackpot_last_winner && bank.jackpot_last_amount
              ? `Dernier : ${bank.jackpot_last_winner} · ${fmt(bank.jackpot_last_amount)}`
              : `${fmt(gamesConfig.bank.jackpotPct)} % des mises des machines à sous`
          }
        />
      </div>

      {canManage ? (
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-xl border border-white/10 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-white">Mouvements de caisse</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Montant">
                <NumberInput value={amount} onChange={setAmount} min={1} step={100000} suffix="jetons" />
              </Field>
              <Field label="Motif (journal)">
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140} placeholder="Ex. dépôt du patron" className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => act('deposit')} loading={busy === 'deposit'} disabled={!!busy || amount < 1}>
                Recharger
              </Button>
              <Button onClick={() => act('withdraw')} loading={busy === 'withdraw'} disabled={!!busy || amount < 1 || amount > bank.balance}>
                Retirer
              </Button>
              <Button onClick={() => act('collect')} loading={busy === 'collect'} disabled={!!busy || bank.owner_total <= 0}>
                Bénéfice récupéré
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-white">Réglages</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Gain max / manche">
                <NumberInput value={draft.maxWinPct} onChange={(v) => setDraft({ ...draft, maxWinPct: v })} min={1} max={50} suffix="% caisse" />
              </Field>
              <Field label="Gardé en caisse">
                <NumberInput value={draft.keepPct} onChange={(v) => setDraft({ ...draft, keepPct: v })} min={0} max={100} suffix="%" />
              </Field>
              <Field label="Part jackpot">
                <NumberInput value={draft.jackpotPct} onChange={(v) => setDraft({ ...draft, jackpotPct: v })} min={0} max={5} step={0.5} suffix="% mise" />
              </Field>
              <Field label="Départ du jackpot">
                <NumberInput value={draft.jackpotSeed} onChange={(v) => setDraft({ ...draft, jackpotSeed: v })} min={0} step={10000} />
              </Field>
              <Field label="Jackpot moyen">
                <NumberInput value={draft.jackpotAverage} onChange={(v) => setDraft({ ...draft, jackpotAverage: v })} min={1000} step={50000} />
              </Field>
            </div>
            <div>
              <Button variant="primary" onClick={saveSettings} loading={busy === 'settings'} disabled={!!busy || !dirty}>
                <Save size={13} /> Enregistrer
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-neutral-500">Seuls le fondateur et le développeur peuvent recharger la caisse ou modifier ses réglages.</p>
      )}

      {feedback && <p className={cx('mt-3 text-[12px]', feedback.bad ? 'text-rose-300' : 'text-emerald-400')}>{feedback.text}</p>}

      <div className="mt-5">
        <HelpBox title="Comment fonctionne la caisse ?">
          <p>
            <b>Une seule caisse paie tous les jeux</b>, comme dans un vrai casino. Toutes les mises y entrent, tous les gains en sortent.
            Les crédits manuels du staff n'y touchent pas.
          </p>
          <p>
            <b>Gain max par manche</b> = {fmt(gamesConfig.bank.maxWinPct)} % de la caisse : un joueur ne peut jamais la vider d'un coup.
            Si elle descend, le gain max baisse avec elle ; si elle est vide, les jeux ferment jusqu'à ce que la direction la recharge.
          </p>
          <p>
            <b>Partage du bénéfice</b> : quand la caisse dépasse son plus haut niveau, {fmt(gamesConfig.bank.keepPct)} % du nouveau bénéfice
            reste dedans (le gain max monte) et {fmt(100 - gamesConfig.bank.keepPct)} % revient à la direction. Cliquez « Bénéfice récupéré »
            quand le patron l'a encaissé en ville.
          </p>
          <p>
            <b>Jackpot</b> : {fmt(gamesConfig.bank.jackpotPct)} % de chaque mise des machines à sous l'alimente, chaque tour a une chance (selon sa
            mise) de le remporter. Il est compté dans le RTP des machines (84 % + 1 % = 85 %) : il ne coûte rien au casino.
          </p>
          <p>
            <b>Règle de la maison</b> : un très gros gain (plus de 500 000 jetons) converti en argent en ville se paie en plusieurs fois,
            comme les plafonds de retrait des casinos en ligne.
          </p>
        </HelpBox>
      </div>
    </Card>
  );
};
