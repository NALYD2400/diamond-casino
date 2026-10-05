import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Coins, Crown, Flame, Layers, RefreshCw, TrendingDown, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { getDefaultDiscordAvatar } from '../../lib/discord';
import { GAME_LABELS } from '../../lib/gamesConfig';
import { apiAdminLeaderboards, type AdminLeaderboards, type LeaderboardPlayer } from '../../lib/supabase';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Toggle, cx, fmt, fmtDate } from './ui';

const TOP = 10;

type Row = { player: LeaderboardPlayer; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' };

const MEDAL = ['bg-amber-400 text-black', 'bg-neutral-300 text-black', 'bg-orange-700 text-white'];

/** Une carte de classement : top 10 avec médailles pour le podium */
const Ranking: React.FC<{ title: string; icon: React.ReactNode; hint?: string; rows: Row[]; empty?: string }> = ({ title, icon, hint, rows, empty }) => (
  <Card title={title} icon={icon} padded={false}>
    {hint && <p className="px-5 pt-3 text-[11px] text-neutral-500">{hint}</p>}
    {rows.length === 0 ? (
      <EmptyState title={empty ?? 'Personne pour l’instant'} />
    ) : (
      <ol className="py-2">
        {rows.map((r, i) => (
          <li key={`${r.player.id}-${i}`} className="flex items-center gap-3 px-5 py-2">
            <span
              className={cx(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                MEDAL[i] ?? 'bg-white/5 text-neutral-400',
              )}
            >
              {i + 1}
            </span>
            <img
              src={r.player.avatar_url || getDefaultDiscordAvatar(r.player.id)}
              alt=""
              className="w-7 h-7 rounded-lg object-cover bg-neutral-900 border border-white/10 shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-white truncate">
                {r.player.name}
                {r.player.role !== 'MEMBRE' && <span className="ml-1.5 text-[10px] font-normal text-sky-300">staff</span>}
              </div>
              {r.sub && <div className="text-[11px] text-neutral-500 truncate">{r.sub}</div>}
            </div>
            <span className={cx('font-mono text-[13px] font-semibold shrink-0', r.tone === 'good' ? 'text-emerald-400' : r.tone === 'bad' ? 'text-rose-400' : 'text-white')}>
              {r.value}
            </span>
          </li>
        ))}
      </ol>
    )}
  </Card>
);

const game = (id: string) => GAME_LABELS[id] ?? id;
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;

export const LeaderboardsPanel: React.FC = () => {
  const [days, setDays] = useState(7);
  const [withStaff, setWithStaff] = useState(false);
  const [data, setData] = useState<AdminLeaderboards | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiAdminLeaderboards(days, !withStaff));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, withStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  const period = days === 1 ? 'sur 24 h' : `sur ${days} jours`;
  const players = data?.players ?? [];
  const by = <K extends 'wagered' | 'net' | 'rounds'>(key: K, dir: 1 | -1, keep: (p: (typeof players)[number]) => boolean = () => true) =>
    [...players].filter(keep).sort((a, b) => dir * (Number(b[key]) - Number(a[key]))).slice(0, TOP);
  const empty = withStaff ? 'Personne sur la période' : 'Aucun membre sur la période (cochez « Inclure le staff » pour voir les comptes staff)';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Classements"
        subtitle="Qui mise, gagne, perd et joue le plus, les plus gros coups et les meilleurs collectionneurs."
        actions={
          <>
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 1, label: '24 h' },
                { value: 7, label: '7 j' },
                { value: 30, label: '30 j' },
              ]}
            />
            <Button onClick={() => void load()} loading={loading}>
              <RefreshCw size={13} /> Actualiser
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="max-w-sm">
          <Toggle checked={withStaff} onChange={setWithStaff} label="Inclure le staff" hint="Les comptes staff jouent souvent avec des jetons de test." />
        </div>
        <p className="text-[11px] text-neutral-500 sm:text-right max-w-md">
          Les parties sont gardées 30 jours. Le solde, le total misé depuis l’inscription et les collections ne dépendent pas de la période.
        </p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Argent {period}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Ranking
            title="Ont le plus misé"
            icon={<Coins size={15} />}
            empty={empty}
            rows={by('wagered', 1).map((p) => ({ player: p, value: fmt(p.wagered), sub: `${fmt(p.rounds)} parties · surtout ${game(p.fav_game)}` }))}
          />
          <Ranking
            title="Ont le plus gagné"
            icon={<TrendingUp size={15} />}
            hint="Gains moins mises : ce qu’ils ont pris au casino."
            empty={empty}
            rows={by('net', 1, (p) => p.net > 0).map((p) => ({ player: p, value: signed(p.net), tone: 'good', sub: `misé ${fmt(p.wagered)}` }))}
          />
          <Ranking
            title="Ont le plus perdu"
            icon={<TrendingDown size={15} />}
            hint="Mises moins gains : ce que le casino leur a pris."
            empty={empty}
            rows={by('net', -1, (p) => p.net < 0).map((p) => ({ player: p, value: signed(p.net), tone: 'bad', sub: `misé ${fmt(p.wagered)}` }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Activité {period}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Ranking
            title="Ont le plus joué"
            icon={<Activity size={15} />}
            empty={empty}
            rows={by('rounds', 1).map((p) => ({ player: p, value: `${fmt(p.rounds)} parties`, sub: `dernière ${fmtDate(p.last_at)} · surtout ${game(p.fav_game)}` }))}
          />
          <Ranking
            title="Ont le moins joué"
            icon={<Activity size={15} />}
            hint="Parmi ceux qui ont joué au moins une fois sur la période."
            empty={empty}
            rows={by('rounds', -1).map((p) => ({ player: p, value: `${fmt(p.rounds)} partie${p.rounds > 1 ? 's' : ''}`, sub: `dernière ${fmtDate(p.last_at)}` }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Records sur une seule partie {period}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Ranking
            title="Plus grosses mises"
            icon={<Flame size={15} />}
            empty={empty}
            rows={(data?.big_bets ?? []).map((r) => ({
              player: r,
              value: fmt(r.bet_amount),
              sub: `${game(r.game_id)} · ${r.win_amount > r.bet_amount ? `gagné ${fmt(r.win_amount)}` : r.win_amount > 0 ? `récupéré ${fmt(r.win_amount)}` : 'perdu'} · ${fmtDate(r.created_at)}`,
            }))}
          />
          <Ranking
            title="Plus gros gains"
            icon={<Trophy size={15} />}
            hint="Gain moins mise, sur une partie."
            empty={empty}
            rows={(data?.big_wins ?? []).map((r) => ({
              player: r,
              value: signed(r.win_amount - r.bet_amount),
              tone: 'good',
              sub: `${game(r.game_id)} · mise ${fmt(r.bet_amount)} · ${fmtDate(r.created_at)}`,
            }))}
          />
          <Ranking
            title="Plus grosses pertes"
            icon={<TrendingDown size={15} />}
            hint="Mise moins gain, sur une partie."
            empty={empty}
            rows={(data?.big_losses ?? []).map((r) => ({
              player: r,
              value: signed(r.win_amount - r.bet_amount),
              tone: 'bad',
              sub: `${game(r.game_id)} · mise ${fmt(r.bet_amount)} · ${fmtDate(r.created_at)}`,
            }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Depuis toujours</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Ranking title="Les plus riches" icon={<Wallet size={15} />} hint="Solde actuel en jetons." rows={(data?.richest ?? []).map((p) => ({ player: p, value: fmt(p.value) }))} />
          <Ranking
            title="Plus gros joueurs depuis l’inscription"
            icon={<Crown size={15} />}
            hint="Total misé depuis la création du compte."
            rows={(data?.lifetime ?? []).map((p) => ({ player: p, value: fmt(p.value) }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Collections</h2>
        {(data?.collections ?? []).length === 0 ? (
          <Card>
            <EmptyState icon={<Layers size={26} />} title="Aucun album actif" />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data!.collections.map((c) => (
              <Ranking
                key={c.id}
                title={`${c.name} · ${c.total} cartes`}
                icon={<Layers size={15} />}
                hint="Cartes différentes possédées en ce moment."
                rows={c.top.map((p) => ({
                  player: p,
                  value: (
                    <span className="inline-flex items-center gap-2">
                      {p.completed && <Badge tone="good">Complété</Badge>}
                      {p.cards} / {c.total}
                    </span>
                  ),
                  sub: `${fmt(p.found)} cartes trouvées au total`,
                }))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
