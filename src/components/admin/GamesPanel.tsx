import React, { useEffect, useMemo, useState } from 'react';
import { Bomb, Dog, Disc, Skull } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { type GamesConfig } from '../../lib/gamesConfig';
import { calculateMultiplier } from '../mines/minesMath';
import type { AdminTab } from '../AdminConsole';
import { Badge, Card, Field, HelpBox, NumberInput, PageHeader, SaveBar, Toggle, cx, fmt } from './ui';

type GameId = keyof GamesConfig;

const META: Record<GameId, { name: string; icon: React.ReactNode; route: string }> = {
  mines: { name: 'Mines', icon: <Bomb size={16} />, route: '/mines' },
  doghouse: { name: 'The Dog House', icon: <Dog size={16} />, route: '/slots' },
  wanted: { name: 'Wanted Dead or a Wild', icon: <Skull size={16} />, route: '/wanted' },
  wheel: { name: 'Roue de la Fortune', icon: <Disc size={16} />, route: '/roue-de-la-fortune' },
};

export const GamesPanel: React.FC<{ showToast: (m: string) => void; goTo: (t: AdminTab) => void }> = ({ showToast, goTo }) => {
  const { gamesConfig, saveGamesConfig, dashboard, economy } = useCasinoAdmin();
  const [draft, setDraft] = useState<GamesConfig>(gamesConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(gamesConfig), [gamesConfig]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(gamesConfig);

  const set = <G extends GameId>(game: G, patch: Partial<GamesConfig[G]>) =>
    setDraft((d) => ({ ...d, [game]: { ...d[game], ...patch } }));

  const save = async () => {
    setSaving(true);
    const ok = await saveGamesConfig(draft);
    setSaving(false);
    if (ok) showToast('Réglages des jeux enregistrés — appliqués immédiatement par le serveur.');
  };

  const stats = (id: string) => dashboard?.games?.[id];
  const statLine = (id: string) => {
    const g = stats(id);
    if (!g) return <span className="text-[11px] text-neutral-500">Aucune partie sur la période du tableau de bord</span>;
    return (
      <span className="text-[11px] text-neutral-400">
        {fmt(g.rounds)} parties · misé {fmt(g.wagered)} · payé {fmt(g.paid)} ·{' '}
        <span className={Number(g.profit) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          {Number(g.profit) >= 0 ? '+' : ''}
          {fmt(g.profit)} pour le casino
        </span>
        {g.rtp !== null && <> · RTP réel {g.rtp} %</>}
      </span>
    );
  };

  const header = (id: GameId) => (
    <div className="flex items-center gap-2">
      <Badge tone={draft[id].enabled ? 'good' : 'bad'}>{draft[id].enabled ? 'Ouvert' : 'Fermé'}</Badge>
      <a href={META[id].route} target="_blank" rel="noreferrer" className="text-[11px] text-neutral-400 hover:text-white">
        Ouvrir ↗
      </a>
    </div>
  );

  const betFields = (id: 'mines' | 'doghouse' | 'wanted') => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Field label="Mise minimum" hint="Plus petite mise acceptée">
        <NumberInput value={draft[id].minBet} min={1} onChange={(v) => set(id, { minBet: v })} suffix="⛁" />
      </Field>
      <Field label="Mise maximum" hint="Plus grosse mise acceptée">
        <NumberInput value={draft[id].maxBet} min={1} onChange={(v) => set(id, { maxBet: v })} suffix="⛁" />
      </Field>
      <Field label="Gain max. par manche" hint="Plafond de sécurité, bonus compris">
        <NumberInput value={draft[id].maxPayout} min={1000} onChange={(v) => set(id, { maxPayout: v })} suffix="⛁" />
      </Field>
    </div>
  );

  const minesExamples = useMemo(
    () =>
      [
        { mines: 1, gems: 5 },
        { mines: 3, gems: 4 },
        { mines: 5, gems: 3 },
        { mines: 10, gems: 3 },
        { mines: 24, gems: 1 },
      ].map((e) => ({ ...e, mult: calculateMultiplier(e.mines, e.gems, draft.mines.rtp / 100) })),
    [draft.mines.rtp],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jeux"
        subtitle="Ouvrez ou fermez chaque jeu et réglez ses limites. Tout est vérifié par le serveur : un joueur ne peut pas contourner ces réglages."
      />

      {economy.maintenanceMode && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-[13px] text-rose-200 flex items-center justify-between gap-3">
          Maintenance active : tous les jeux sont fermés, quels que soient les réglages ci-dessous.
          <button type="button" className="underline cursor-pointer" onClick={() => goTo('system')}>
            Gérer
          </button>
        </div>
      )}

      <div className="sticky top-0 z-20">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setDraft(gamesConfig)} />
      </div>

      <HelpBox title="Comment fonctionnent les jeux maintenant ?" defaultOpen={false}>
        <p>
          Quand un joueur mise ses jetons, <b>c'est le serveur qui tire le résultat</b>, débite la mise et crédite le gain, en une seule
          opération. Le navigateur du joueur ne fait qu'afficher l'animation : impossible de tricher en modifiant la page ou en
          appelant l'API à la main.
        </p>
        <p>
          <b>RTP</b> (taux de retour) = la part des mises rendue aux joueurs sur le long terme. À 96 %, pour 100 000 jetons misés le
          casino en garde environ 4 000. Sur peu de parties le résultat réel varie beaucoup, c'est normal.
        </p>
        <p>
          <b>Mode démo</b> : chaque jeu garde un mode démo avec de faux jetons, joué dans le navigateur, qui ne touche jamais aux vrais
          soldes.
        </p>
      </HelpBox>

      {/* MINES */}
      <Card title={META.mines.name} icon={META.mines.icon} right={header('mines')}>
        <div className="flex flex-col gap-5">
          <Toggle checked={draft.mines.enabled} onChange={(v) => set('mines', { enabled: v })} label="Jeu ouvert" hint="Fermé : les joueurs voient un message et ne peuvent pas miser." />
          {betFields('mines')}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Field
              label="RTP (taux de retour joueur)"
              hint={`Le casino garde en moyenne ${fmt(100 - draft.mines.rtp, 1)} % des mises. Entre 80 et 99,5 %.`}
            >
              <NumberInput value={draft.mines.rtp} min={80} max={99.5} step={0.5} onChange={(v) => set('mines', { rtp: v })} suffix="%" />
            </Field>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="text-[11px] text-neutral-400 mb-2">Multiplicateurs obtenus avec ce RTP</div>
              <div className="grid grid-cols-5 gap-2 text-center">
                {minesExamples.map((e) => (
                  <div key={e.mines}>
                    <div className="font-mono text-sm font-bold text-white">x{fmt(e.mult, 2)}</div>
                    <div className="text-[10px] text-neutral-500 leading-tight">
                      {e.mines} mine{e.mines > 1 ? 's' : ''}
                      <br />
                      {e.gems} diamant{e.gems > 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {statLine('mines')}
          <HelpBox title="Mines : les règles">
            <p>
              Le joueur choisit sa mise et le nombre de mines (1 à 24) cachées dans 25 cases. Au départ, le serveur tire la grille, la
              garde secrète et <b>débite la mise</b>. Chaque case cliquée est vérifiée par le serveur. Le joueur peut encaisser quand il
              veut : gain = mise × multiplicateur.
            </p>
            <p>
              Multiplicateur = RTP ÷ probabilité d'avoir survécu. Plus il y a de mines et de cases ouvertes, plus il grimpe. S'il ferme
              l'onglet, la manche reste ouverte et reprend à son retour (la mise reste engagée).
            </p>
          </HelpBox>
        </div>
      </Card>

      {/* DOG HOUSE */}
      <Card title={META.doghouse.name} icon={META.doghouse.icon} right={header('doghouse')}>
        <div className="flex flex-col gap-5">
          <Toggle checked={draft.doghouse.enabled} onChange={(v) => set('doghouse', { enabled: v })} label="Jeu ouvert" />
          {betFields('doghouse')}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="flex flex-col gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <Toggle
                checked={draft.doghouse.buyEnabled}
                onChange={(v) => set('doghouse', { buyEnabled: v })}
                label="Achat de bonus"
                hint="Le joueur paie pour lancer directement les tours gratuits."
              />
              <Field
                label="Prix de l'achat (× la mise)"
                hint={
                  <>
                    Le bonus rapporte ≈ <b>110×</b> la mise en moyenne. À {fmt(draft.doghouse.buyPrice)}× le retour est d'environ{' '}
                    <b className={110 / draft.doghouse.buyPrice > 1 ? 'text-rose-300' : 'text-emerald-300'}>
                      {fmt((110 / Math.max(1, draft.doghouse.buyPrice)) * 100, 0)} %
                    </b>
                    {110 / draft.doghouse.buyPrice > 1 && ' : le casino PERD de l’argent'}.
                  </>
                }
              >
                <NumberInput value={draft.doghouse.buyPrice} min={50} max={1000} onChange={(v) => set('doghouse', { buyPrice: v })} suffix="×" disabled={!draft.doghouse.buyEnabled} />
              </Field>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <Toggle
                checked={draft.doghouse.boostEnabled}
                onChange={(v) => set('doghouse', { boostEnabled: v })}
                label="Boost (Ante Bet)"
                hint="+25 % de mise pour un bonus environ 1,7× plus fréquent. RTP ≈ 93 %."
              />
            </div>
          </div>
          {statLine('doghouse')}
        </div>
      </Card>

      {/* WANTED */}
      <Card title={META.wanted.name} icon={META.wanted.icon} right={header('wanted')}>
        <div className="flex flex-col gap-5">
          <Toggle checked={draft.wanted.enabled} onChange={(v) => set('wanted', { enabled: v })} label="Jeu ouvert" />
          {betFields('wanted')}
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 flex flex-col gap-4">
            <Toggle checked={draft.wanted.buyEnabled} onChange={(v) => set('wanted', { buyEnabled: v })} label="Achat de bonus" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(
                [
                  ['gtr', 'Great Train Robbery', 78],
                  ['duel', 'Duel at Dawn', 200],
                  ['dmh', "Dead Man's Hand", 395],
                ] as const
              ).map(([k, name, value]) => (
                <Field
                  key={k}
                  label={`${name} (× la mise)`}
                  hint={
                    <>
                      Vaut ≈ {value}× · retour{' '}
                      <b className={value / draft.wanted.buyPrices[k] > 1 ? 'text-rose-300' : 'text-emerald-300'}>
                        {fmt((value / Math.max(1, draft.wanted.buyPrices[k])) * 100)} %
                      </b>
                    </>
                  }
                >
                  <NumberInput
                    value={draft.wanted.buyPrices[k]}
                    min={20}
                    onChange={(v) => set('wanted', { buyPrices: { ...draft.wanted.buyPrices, [k]: v } })}
                    suffix="×"
                    disabled={!draft.wanted.buyEnabled}
                  />
                </Field>
              ))}
            </div>
          </div>
          {statLine('wanted')}
        </div>
      </Card>

      {/* ROUE */}
      <Card title={META.wheel.name} icon={META.wheel.icon} right={header('wheel')}>
        <div className="flex flex-col gap-4">
          <Toggle
            checked={draft.wheel.enabled}
            onChange={(v) => set('wheel', { enabled: v })}
            label="Roue ouverte"
            hint="Tirage gratuit, limité par un délai entre deux tirages."
          />
          <div className={cx('text-[13px] text-neutral-400')}>
            Les lots, leurs chances et le délai se règlent dans l'onglet{' '}
            <button type="button" className="text-white underline cursor-pointer" onClick={() => goTo('wheel')}>
              Roue de la Fortune
            </button>
            .
          </div>
          {statLine('lucky_wheel')}
        </div>
      </Card>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setDraft(gamesConfig)} />
    </div>
  );
};
