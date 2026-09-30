import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dices, Loader2, RefreshCw } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { dbFetchAllBets, type SupabaseBetEntry } from '../../lib/supabase';
import { Badge, Button, EmptyState, PageHeader, cx, fmt, fmtDate, inputClass } from './ui';

const PAGE = 50;

const GAMES: { id: string; label: string }[] = [
  { id: 'lucky_wheel', label: 'Roue' },
  { id: 'doghouse', label: 'Dog House' },
  { id: 'wanted', label: 'Wanted' },
  { id: 'mines', label: 'Mines' },
  { id: 'crash', label: 'Crash' },
  { id: 'boosters', label: 'Boosters' },
];
const GAME_LABEL = Object.fromEntries(GAMES.map((g) => [g.id, g.label])) as Record<string, string>;

const MIN_WINS = [
  { value: 0, label: 'Tous les gains' },
  { value: 100_000, label: '≥ 100 000' },
  { value: 1_000_000, label: '≥ 1 000 000' },
  { value: 10_000_000, label: '≥ 10 000 000' },
];

/** Détail lisible d'une partie (mode, bonus, pack, lot…) */
function detailOf(b: SupabaseBetEntry): string {
  const d = (b.result_data ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (d.mode === 'voucher') parts.push('bonus offert');
  else if (d.mode === 'buy') parts.push('achat de bonus');
  else if (d.mode === 'boost') parts.push('boost');
  if (typeof d.bonus === 'string' && d.bonus) parts.push(`bonus ${d.bonus}`);
  if (typeof d.pack === 'string') parts.push(d.pack);
  if (typeof d.segment === 'string') parts.push(d.segment);
  return parts.join(' · ');
}

export const RoundsPanel: React.FC = () => {
  const { citizens } = useCasinoAdmin();
  const [game, setGame] = useState('');
  const [profileId, setProfileId] = useState('');
  const [minWin, setMinWin] = useState(0);
  const [rows, setRows] = useState<SupabaseBetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const who = useMemo(() => new Map(citizens.map((c) => [c.profileId, c])), [citizens]);

  const load = useCallback(
    async (append: boolean, before?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await dbFetchAllBets({
          game: game || undefined,
          profileId: profileId || undefined,
          minWin: minWin || undefined,
          before,
          limit: PAGE,
        });
        setRows((prev) => (append ? [...prev, ...page] : page));
        setMore(page.length === PAGE);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [game, profileId, minWin],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Parties"
        subtitle="Chaque tirage des jeux (mise, gain, mode) pour vérifier une contestation ou repérer un gros gain. L'historique est conservé 30 jours."
        actions={
          <Button loading={loading} onClick={() => void load(false)}>
            <RefreshCw size={13} /> Actualiser
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <select className={cx(inputClass, 'w-auto cursor-pointer')} value={game} onChange={(e) => setGame(e.target.value)}>
          <option value="" className="bg-black">
            Tous les jeux
          </option>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id} className="bg-black">
              {g.label}
            </option>
          ))}
        </select>
        <select className={cx(inputClass, 'w-auto cursor-pointer max-w-[260px]')} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="" className="bg-black">
            Tous les joueurs
          </option>
          {citizens.map((c) => (
            <option key={c.profileId} value={c.profileId} className="bg-black">
              {c.rpFirstName} {c.rpLastName} · #{c.citizenId}
            </option>
          ))}
        </select>
        <select className={cx(inputClass, 'w-auto cursor-pointer')} value={minWin} onChange={(e) => setMinWin(Number(e.target.value))}>
          {MIN_WINS.map((m) => (
            <option key={m.value} value={m.value} className="bg-black">
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {rows.length === 0 && !loading ? (
        <EmptyState icon={<Dices size={22} />} title="Aucune partie" hint="Aucun tirage ne correspond à ces filtres." />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-neutral-950 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Joueur</th>
                <th className="px-3 py-3 font-medium">Jeu</th>
                <th className="px-3 py-3 font-medium text-right">Mise</th>
                <th className="px-3 py-3 font-medium text-right">Gain</th>
                <th className="px-3 py-3 font-medium text-right">Multi</th>
                <th className="px-4 py-3 font-medium">Détail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const c = b.profile_id ? who.get(b.profile_id) : undefined;
                const win = Number(b.win_amount) || 0;
                const bet = Number(b.bet_amount) || 0;
                return (
                  <tr key={b.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    <td className="px-3 py-2.5 text-white">{c ? `${c.rpFirstName} ${c.rpLastName}` : '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone="neutral">{GAME_LABEL[b.game_id] ?? b.game_id}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-neutral-300">{fmt(bet)}</td>
                    <td className={cx('px-3 py-2.5 text-right font-mono', win > bet ? 'text-emerald-400' : 'text-neutral-400')}>{fmt(win)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-neutral-500">{b.multiplier ? `${fmt(Number(b.multiplier), 2)}x` : '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-500">{detailOf(b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center">
        {loading ? (
          <Loader2 size={18} className="animate-spin text-neutral-500" />
        ) : (
          more &&
          rows.length > 0 && <Button onClick={() => void load(true, rows[rows.length - 1].created_at)}>Charger les {PAGE} suivantes</Button>
        )}
      </div>
    </div>
  );
};
