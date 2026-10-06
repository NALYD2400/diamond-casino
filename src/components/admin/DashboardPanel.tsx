import React from 'react';
import { AlertTriangle, Car, Coins, Crown, Gamepad2, RefreshCw, TrendingDown, TrendingUp, Users, Wrench } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { GAME_LABELS, slotTotalRtp } from '../../lib/gamesConfig';
import { BankCard } from './BankCard';
import type { AdminTab } from '../AdminConsole';
import { Badge, Button, Card, EmptyState, HelpBox, PageHeader, RoleBadge, Segmented, Stat, cx, fmt, fmtChips } from './ui';

/** En dessous, le RTP réel d'un jeu dépend surtout du hasard (gros gains rares) : pas d'alerte */
const MIN_ROUNDS = 1000;

export const DashboardPanel: React.FC<{ goTo: (tab: AdminTab) => void }> = ({ goTo }) => {
  const { dashboard, dashboardDays, setDashboardDays, dashboardMembersOnly, setDashboardMembersOnly, refreshDashboard, economy, gamesConfig } =
    useCasinoAdmin();
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await refreshDashboard();
    setRefreshing(false);
  };

  const t = dashboard?.totals;
  const games = dashboard?.games ?? {};
  // Tous les jeux sont payants (roue comprise) : véhicules donnés comptés dans « payé » à leur valeur
  const paidGames = Object.entries(games);
  const profit = paidGames.reduce((a, [, g]) => a + Number(g.profit), 0);
  const wagered = paidGames.reduce((a, [, g]) => a + Number(g.wagered), 0);
  const targetRtp: Record<string, string> = {
    mines: `${fmt(gamesConfig.mines.rtp)} %`,
    crash: `${fmt(gamesConfig.crash.rtp)} %`,
    doghouse: `≈ ${fmt(slotTotalRtp('doghouse', gamesConfig))} %`,
    wanted: `≈ ${fmt(slotTotalRtp('wanted', gamesConfig))} %`,
    lucky_wheel: `≤ ${fmt(gamesConfig.wheel.maxRtp)} %`,
    boosters: `≤ ${fmt(gamesConfig.boosters.maxRtp)} %`,
  };
  const period = dashboardDays === 0 ? 'depuis le début' : dashboardDays === 1 ? 'sur 24 h' : `sur ${dashboardDays} jours`;
  const maxDaily = Math.max(1, ...(dashboard?.daily ?? []).map((d) => Math.max(Number(d.wagered), Number(d.paid))));

  const alerts: { tone: 'warn' | 'bad' | 'info'; text: string; action?: { label: string; tab: AdminTab } }[] = [];
  if (economy.maintenanceMode) alerts.push({ tone: 'bad', text: 'Le casino est en MAINTENANCE : aucun joueur ne peut jouer.', action: { label: 'Système', tab: 'system' } });
  if (t && t.pending_vip > 0) alerts.push({ tone: 'warn', text: `${t.pending_vip} demande(s) VIP à valider (paiement en € à vérifier).`, action: { label: 'Voir', tab: 'vip' } });
  if (t && t.pending_rewards > 0) alerts.push({ tone: 'warn', text: `${t.pending_rewards} lot(s) réclamé(s) à livrer au joueur.`, action: { label: 'Voir', tab: 'rewards' } });
  const closed = (['mines', 'crash', 'doghouse', 'wanted', 'wheel', 'collections'] as const).filter((g) => !gamesConfig[g].enabled);
  if (closed.length) alerts.push({ tone: 'info', text: `Jeu(x) fermé(s) : ${closed.map((g) => (g === 'wheel' ? 'Roue' : GAME_LABELS[g])).join(', ')}.`, action: { label: 'Machines', tab: 'games' } });
  const bank = dashboard?.bank;
  if (bank && bank.balance <= 0) alerts.push({ tone: 'bad', text: 'La caisse du casino est vide : tous les jeux sont fermés. Rechargez-la ci-dessous.' });
  else if (bank && bank.balance < bank.start_amount * 0.5) alerts.push({ tone: 'warn', text: `La caisse est sous la moitié de son montant de départ (${fmt(bank.balance)} jetons) : le gain max par manche a baissé.` });
  // Sous MIN_ROUNDS parties, un seul gros gain fait varier le RTP de plusieurs dizaines de points : pas d'alerte
  paidGames.forEach(([id, g]) => {
    if (g.rtp !== null && Number(g.rounds) >= MIN_ROUNDS && Number(g.rtp) > 110) {
      alerts.push({ tone: 'bad', text: `${GAME_LABELS[id] ?? id} a rendu ${g.rtp} % des mises sur ${fmt(g.rounds)} parties ${period} : à vérifier (réglage trop généreux ?).`, action: { label: 'Machines', tab: 'games' } });
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        subtitle="Les vrais chiffres du casino, calculés directement dans la base de données à partir de chaque partie jouée."
        actions={
          <>
            <Segmented
              value={dashboardMembersOnly ? 'members' : 'all'}
              onChange={(v) => setDashboardMembersOnly(v === 'members')}
              options={[
                { value: 'members', label: 'Joueurs' },
                { value: 'all', label: 'Avec le staff' },
              ]}
            />
            <Segmented
              value={dashboardDays}
              onChange={setDashboardDays}
              options={[
                { value: 1, label: '24 h' },
                { value: 7, label: '7 j' },
                { value: 30, label: '30 j' },
                { value: 0, label: 'Tout' },
              ]}
            />
            <Button onClick={refresh} loading={refreshing}>
              <RefreshCw size={13} /> Actualiser
            </Button>
          </>
        }
      />

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={cx(
                'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px]',
                a.tone === 'bad' && 'border-rose-500/30 bg-rose-500/[0.06] text-rose-200',
                a.tone === 'warn' && 'border-white/20 bg-white/[0.05] text-neutral-200',
                a.tone === 'info' && 'border-sky-400/25 bg-sky-500/[0.05] text-sky-200',
              )}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" /> {a.text}
              </span>
              {a.action && (
                <Button size="sm" onClick={() => goTo(a.action!.tab)}>
                  {a.action.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label={`Bénéfice du casino ${period}`}
          value={`${profit >= 0 ? '+' : ''}${fmtChips(profit)}`}
          tone={profit >= 0 ? 'good' : 'bad'}
          icon={profit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          hint={`Mises (${fmt(wagered)}) − gains payés (véhicules à leur valeur, moins la part non versée des revendus ou retirés)`}
        />
        <Stat
          label="Jetons chez les joueurs"
          value={fmtChips(t?.chips_players_only)}
          tone="default"
          icon={<Coins size={16} />}
          hint={`${fmt(t?.chips_in_circulation)} en comptant le staff`}
        />
        <Stat
          label="Joueurs"
          value={fmt(t?.players)}
          icon={<Users size={16} />}
          hint={`${fmt(t?.active_players)} actifs ${period} · ${fmt(t?.vip_active)} VIP`}
        />
        <Stat
          label={`Jetons créés ${period}`}
          value={fmtChips((t?.admin_injected ?? 0) + (t?.vip_bonuses ?? 0) + (t?.reward_sales ?? 0))}
          icon={<Crown size={16} />}
          hint={`Staff ${fmt(t?.admin_injected)} · VIP ${fmt(t?.vip_bonuses)} · revente de lots ${fmt(t?.reward_sales ?? 0)}`}
        />
      </div>

      {dashboard && <BankCard bank={dashboard.bank} />}

      <Card
        title={`Résultats par jeu ${period}${dashboardMembersOnly ? ' (sans le staff)' : ''}`}
        icon={<Gamepad2 size={15} />}
        padded={false}
      >
        {Object.keys(games).length === 0 ? (
          <EmptyState title="Aucune partie sur la période" hint="Les parties jouées en jetons apparaîtront ici." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10">
                  <th className="px-5 py-3 font-medium">Jeu</th>
                  <th className="px-3 py-3 font-medium text-right">Parties</th>
                  <th className="px-3 py-3 font-medium text-right">Joueurs</th>
                  <th className="px-3 py-3 font-medium text-right">Misé</th>
                  <th className="px-3 py-3 font-medium text-right">Payé</th>
                  <th className="px-3 py-3 font-medium text-right">Bénéfice casino</th>
                  <th className="px-3 py-3 font-medium text-right">RTP réel</th>
                  <th className="px-5 py-3 font-medium text-right">Plus gros gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {Object.entries(games)
                  .sort((a, b) => Number(b[1].wagered) - Number(a[1].wagered))
                  .map(([id, g]) => (
                    <tr key={id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3 font-semibold text-white">{GAME_LABELS[id] ?? id}</td>
                      <td className="px-3 py-3 text-right font-mono text-neutral-300">{fmt(g.rounds)}</td>
                      <td className="px-3 py-3 text-right font-mono text-neutral-300">{fmt(g.players)}</td>
                      <td className="px-3 py-3 text-right font-mono text-neutral-300">{fmt(g.wagered)}</td>
                      <td className="px-3 py-3 text-right font-mono text-neutral-300">{fmt(g.paid)}</td>
                      <td className={cx('px-3 py-3 text-right font-mono font-semibold', Number(g.profit) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {`${Number(g.profit) >= 0 ? '+' : ''}${fmt(g.profit)}`}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {g.rtp === null ? (
                          <span className="text-neutral-500 text-xs">{targetRtp[id] ?? '—'}</span>
                        ) : (
                          <span className="inline-flex flex-col items-end">
                            <span
                              className={cx(
                                'font-mono font-semibold',
                                Number(g.rounds) < MIN_ROUNDS ? 'text-neutral-400' : Number(g.rtp) > 100 ? 'text-rose-300' : 'text-white',
                              )}
                            >
                              {g.rtp} %
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              {Number(g.rounds) < MIN_ROUNDS ? `peu de parties · visé ${targetRtp[id] ?? '—'}` : `visé ${targetRtp[id] ?? '—'}`}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-white">{fmt(g.biggest_win)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card title="Activité par jour (30 derniers jours max.)" className="xl:col-span-3">
          {(dashboard?.daily ?? []).length === 0 ? (
            <EmptyState title="Pas encore d'activité" />
          ) : (
            <>
              <div className="flex items-end gap-1 h-40">
                {dashboard!.daily.map((d) => (
                  <div key={d.day} className="flex-1 min-w-0 h-full flex items-end gap-px group relative" title={`${d.day} · misé ${fmt(d.wagered)} · payé ${fmt(d.paid)} · ${fmt(d.rounds)} parties`}>
                    <div className="flex-1 bg-white/70 rounded-t-sm" style={{ height: `${(Number(d.wagered) / maxDaily) * 100}%` }} />
                    <div className="flex-1 bg-white/30 rounded-t-sm" style={{ height: `${(Number(d.paid) / maxDaily) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/70" /> Misé par les joueurs</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/30" /> Payé par le casino (roue incluse)</span>
              </div>
            </>
          )}
        </Card>

        <Card title={`Joueurs les plus gagnants ${period}`} className="xl:col-span-2" padded={false}>
          {(dashboard?.top_players ?? []).length === 0 ? (
            <EmptyState title="Aucun joueur sur la période" />
          ) : (
            <ul className="divide-y divide-white/5">
              {dashboard!.top_players.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-white truncate">
                      {p.name} <span className="text-neutral-500 font-mono text-xs">#{p.citizen_id}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RoleBadge role={p.role} />
                      <span className="text-[11px] text-neutral-500">{fmt(p.rounds)} parties · misé {fmt(p.wagered)}</span>
                    </div>
                  </div>
                  <span className={cx('font-mono text-sm font-semibold shrink-0', Number(p.net) >= 0 ? 'text-rose-300' : 'text-emerald-400')}>
                    {Number(p.net) >= 0 ? '+' : ''}
                    {fmt(p.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button type="button" onClick={() => goTo('vip')} className="text-left cursor-pointer">
          <Stat label="Ventes VIP (jetons)" value={fmtChips(t?.vip_sales)} icon={<Crown size={16} />} hint={`${fmt(t?.pending_vip)} demande(s) en attente`} />
        </button>
        <button type="button" onClick={() => goTo('rewards')} className="text-left cursor-pointer">
          <Stat label="Lots à livrer" value={fmt(t?.pending_rewards)} icon={<Car size={16} />} hint="Réclamés par les joueurs, à livrer en ville" tone={t && t.pending_rewards > 0 ? 'gold' : 'default'} />
        </button>
        <Stat
          label="Manches en cours"
          value={fmt(Number(t?.mines_open_rounds ?? 0) + Number(t?.crash_open_rounds ?? 0))}
          icon={<Wrench size={16} />}
          hint={`Mines ${fmt(t?.mines_open_rounds)} · Crash ${fmt(t?.crash_open_rounds ?? 0)} — ${fmt(
            Number(t?.mines_open_stake ?? 0) + Number(t?.crash_open_stake ?? 0),
          )} jetons misés`}
        />
      </div>

      <HelpBox title="Comment lire ces chiffres ?">
        <p>
          <b>Misé</b> = jetons joués par les joueurs. <b>Payé</b> = jetons rendus par le jeu. <b>Bénéfice casino</b> = misé − payé :
          positif, le casino gagne ; négatif, les joueurs ont gagné plus qu'ils n'ont perdu.
        </p>
        <p>
          <b>RTP réel</b> = payé ÷ misé. Sur quelques centaines de parties il varie beaucoup (un gros bonus suffit à le faire passer
          au-dessus de 100 %). Il se rapproche du RTP visé quand le nombre de parties augmente : en dessous de {fmt(MIN_ROUNDS)} parties
          il est affiché en gris et ne déclenche pas d'alerte. Par défaut les comptes staff sont exclus, pour que vos tests ne
          faussent pas les chiffres.
        </p>
        <p>
          <b>Jetons créés</b> = jetons apparus sans mise : crédits manuels du staff, dotations VIP et revente de lots (véhicules
          échangés contre des jetons). C'est ce qui fait grossir la masse de jetons des joueurs. La roue et les boosters sont des jeux
          payants : les véhicules qu'ils donnent sont comptés dans « Payé » à leur valeur catalogue. Si le joueur le revend, seule la somme réellement versée en jetons reste comptée ; un véhicule retiré par le staff n'est plus compté.
        </p>
        <p className="text-neutral-400">
          Un joueur « le plus gagnant » affiché en <span className="text-rose-300">rouge</span> a gagné des jetons au casino, en{' '}
          <span className="text-emerald-400">vert</span> il en a perdu.
        </p>
      </HelpBox>

      {!dashboard && <Badge tone="warn">Chargement des statistiques…</Badge>}
    </div>
  );
};
