import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bomb,
  Clock,
  Disc,
  Dog,
  ExternalLink,
  Flame,
  Power,
  RefreshCw,
  Settings2,
  Skull,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useCasinoAdmin, type WheelSegmentConfig } from '../../context/CasinoAdminContext';
import type { GamesConfig } from '../../lib/gamesConfig';
import { apiAdminGameStats, type AdminGameStats, type StatsGameId } from '../../lib/supabase';
import { calculateMultiplier } from '../mines/minesMath';
import type { AdminTab } from '../AdminConsole';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  HelpBox,
  Modal,
  NumberInput,
  PageHeader,
  RoleBadge,
  SaveBar,
  Segmented,
  Toggle,
  cx,
  fmt,
  fmtChips,
  fmtDate,
} from './ui';

type MachineId = keyof GamesConfig;

const MACHINES: { id: MachineId; statsId: StatsGameId; name: string; short: string; icon: React.ElementType; route: string }[] = [
  { id: 'doghouse', statsId: 'doghouse', name: 'The Dog House', short: 'Dog House', icon: Dog, route: '/slots' },
  { id: 'wanted', statsId: 'wanted', name: 'Wanted Dead or a Wild', short: 'Wanted', icon: Skull, route: '/wanted' },
  { id: 'mines', statsId: 'mines', name: 'Mines', short: 'Mines', icon: Bomb, route: '/mines' },
  { id: 'wheel', statsId: 'lucky_wheel', name: 'Roue de la Fortune', short: 'Roue', icon: Disc, route: '/roue-de-la-fortune' },
];

// ---------------------------------------------------------------------------
// Calibrage : RTP théorique de chaque mode et marge d'écart due au hasard
// ---------------------------------------------------------------------------

/** Valeur moyenne des bonus achetés (en × la mise), mesurée sur les moteurs */
const DOG_BONUS_VALUE = 110;
const WANTED_BONUS_VALUE = { gtr: 78, duel: 200, dmh: 395 } as const;
/** Écart-type d'une manche en × la mise : plus il est grand, plus le RTP réel met du temps à se stabiliser */
const VOLATILITY: Record<MachineId, number> = { doghouse: 12, wanted: 15, mines: 3, wheel: 1.5 };
const MIN_ROUNDS = 200;

function wheelExpected(segments: WheelSegmentConfig[]) {
  const total = segments.reduce((a, s) => a + Math.max(0, Number(s.dropRate) || 0), 0);
  if (total <= 0) return 0;
  return segments.reduce((a, s) => a + (s.type === 'chips' ? (Number(s.value) || 0) * (Math.max(0, s.dropRate) / total) : 0), 0);
}

/** RTP visé (%) pour une ligne de la répartition, ou null si non applicable */
function targetFor(machine: MachineId, key: string, cfg: GamesConfig, segments: WheelSegmentConfig[]): number | null {
  switch (machine) {
    case 'doghouse':
      if (key === 'boost') return 93;
      if (key === 'buy') return (DOG_BONUS_VALUE / Math.max(1, cfg.doghouse.buyPrice)) * 100;
      return 95;
    case 'wanted': {
      if (key.startsWith('buy_')) {
        const b = key.slice(4) as keyof typeof WANTED_BONUS_VALUE;
        return b in WANTED_BONUS_VALUE ? (WANTED_BONUS_VALUE[b] / Math.max(1, cfg.wanted.buyPrices[b])) * 100 : null;
      }
      return 96;
    }
    case 'mines':
      return cfg.mines.rtp;
    case 'wheel':
      return key === '__all' && cfg.wheel.spinPrice > 0 ? (wheelExpected(segments) / cfg.wheel.spinPrice) * 100 : null;
  }
}

/** RTP visé global, pondéré par ce qui a été misé dans chaque mode */
function overallTarget(machine: MachineId, stats: AdminGameStats | undefined, cfg: GamesConfig, segments: WheelSegmentConfig[]): number | null {
  if (machine === 'wheel' || machine === 'mines') return targetFor(machine, '__all', cfg, segments);
  const rows = (stats?.breakdown ?? []).filter((r) => Number(r.wagered) > 0);
  const total = rows.reduce((a, r) => a + Number(r.wagered), 0);
  if (!total) return targetFor(machine, 'spin', cfg, segments);
  let acc = 0;
  for (const r of rows) acc += Number(r.wagered) * (targetFor(machine, r.key, cfg, segments) ?? 95);
  return acc / total;
}

type Verdict = { tone: 'neutral' | 'good' | 'bad' | 'warn'; label: string; text: string };

function verdict(machine: MachineId, rounds: number, rtp: number | null, target: number | null): Verdict {
  if (rtp === null || target === null) return { tone: 'neutral', label: '—', text: 'Pas de RTP à comparer.' };
  if (rounds < MIN_ROUNDS) {
    return {
      tone: 'neutral',
      label: 'Pas assez de parties',
      text: `Il faut au moins ${MIN_ROUNDS} parties pour juger. Pour l'instant l'écart est surtout dû au hasard.`,
    };
  }
  const margin = ((2 * VOLATILITY[machine]) / Math.sqrt(rounds)) * 100;
  const gap = rtp - target;
  if (Math.abs(gap) <= margin) {
    return { tone: 'good', label: 'Normal', text: `Écart de ${fmt(gap, 1)} pts, dans la marge normale du hasard (± ${fmt(margin, 1)} pts).` };
  }
  if (gap > 0) {
    return {
      tone: 'bad',
      label: 'Trop généreuse',
      text: `Rend ${fmt(gap, 1)} pts de plus que prévu, au-delà du hasard (± ${fmt(margin, 1)} pts). Vérifiez les prix des bonus et le gain max.`,
    };
  }
  return { tone: 'warn', label: 'Plus serrée que prévu', text: `Rend ${fmt(-gap, 1)} pts de moins que prévu (± ${fmt(margin, 1)} pts). Le casino gagne plus que la normale.` };
}

function breakdownLabel(machine: MachineId, key: string) {
  if (machine === 'mines') return key === '?' || key === '0' ? 'Ancien format' : `${key} mine${key === '1' ? '' : 's'}`;
  if (machine === 'wheel') return key;
  return (
    {
      spin: 'Tour normal',
      boost: 'Boost (Ante Bet)',
      buy: 'Achat de bonus',
      buy_gtr: 'Achat Great Train Robbery',
      buy_duel: 'Achat Duel at Dawn',
      buy_dmh: "Achat Dead Man's Hand",
    }[key] ?? key
  );
}

const profitClass = (n: number) => (n >= 0 ? 'text-emerald-400' : 'text-rose-400');
const signed = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const MachinesPanel: React.FC<{ showToast: (m: string) => void; goTo: (t: AdminTab) => void }> = ({ showToast, goTo }) => {
  const { gamesConfig, saveGamesConfig, economy, setMaintenance, segments, dashboardDays } = useCasinoAdmin();
  const [days, setDays] = useState<number>(dashboardDays || 7);
  const [stats, setStats] = useState<Partial<Record<MachineId, AdminGameStats>>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MachineId | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; text: string; action: () => Promise<void> }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(
      MACHINES.map(async (m) => [m.id, await apiAdminGameStats(m.statsId, days).catch(() => undefined)] as const),
    );
    setStats(Object.fromEntries(entries.filter(([, s]) => s)) as Partial<Record<MachineId, AdminGameStats>>);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const setOpen = async (id: MachineId, open: boolean) => {
    const ok = await saveGamesConfig({ ...gamesConfig, [id]: { ...gamesConfig[id], enabled: open } });
    if (ok) showToast(`${MACHINES.find((m) => m.id === id)!.short} ${open ? 'ouverte' : 'fermée'}.`);
  };

  const setAll = async (open: boolean) => {
    const next = { ...gamesConfig };
    for (const m of MACHINES) next[m.id] = { ...next[m.id], enabled: open } as never;
    if (await saveGamesConfig(next)) showToast(open ? 'Toutes les machines sont ouvertes.' : 'Toutes les machines sont fermées.');
  };

  const ask = (title: string, text: string, action: () => Promise<void>) => setConfirm({ title, text, action });

  const period = days === 0 ? 'sur tout l’historique (30 j max.)' : days === 1 ? 'sur 24 h' : `sur ${days} jours`;

  const rows = MACHINES.map((m) => {
    const s = stats[m.id];
    const rtp = s?.summary.rtp ?? null;
    const target = overallTarget(m.id, s, gamesConfig, segments);
    return { m, s, rtp: rtp === null ? null : Number(rtp), target, v: verdict(m.id, Number(s?.summary.rounds ?? 0), rtp === null ? null : Number(rtp), target) };
  });
  const played = rows.filter((r) => Number(r.s?.summary.rounds ?? 0) > 0);
  const mostPlayed = [...played].sort((a, b) => Number(b.s!.summary.rounds) - Number(a.s!.summary.rounds))[0];
  const mostProfit = [...played].sort((a, b) => Number(b.s!.summary.profit) - Number(a.s!.summary.profit))[0];
  const worst = [...played].sort((a, b) => Number(a.s!.summary.profit) - Number(b.s!.summary.profit))[0];
  const toCalibrate = rows.filter((r) => r.v.tone === 'bad' || r.v.tone === 'warn');
  const totalProfit = played.reduce((a, r) => a + Number(r.s!.summary.profit), 0);
  const openCount = MACHINES.filter((m) => gamesConfig[m.id].enabled).length;

  const periodPicker = (
    <>
      <Segmented
        value={days}
        onChange={setDays}
        options={[
          { value: 1, label: '24 h' },
          { value: 7, label: '7 j' },
          { value: 30, label: '30 j' },
          { value: 0, label: 'Tout' },
        ]}
      />
      <Button onClick={() => void load()} loading={loading}>
        <RefreshCw size={13} /> Actualiser
      </Button>
    </>
  );

  const confirmModal = confirm && (
    <Modal title={confirm.title} onClose={() => !busy && setConfirm(null)}>
      <p className="text-[13px] text-neutral-300 leading-relaxed">{confirm.text}</p>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="subtle" onClick={() => setConfirm(null)} disabled={busy}>
          Annuler
        </Button>
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await confirm.action();
            setBusy(false);
            setConfirm(null);
          }}
        >
          Confirmer
        </Button>
      </div>
    </Modal>
  );

  if (selected) {
    const row = rows.find((r) => r.m.id === selected)!;
    return (
      <>
        {confirmModal}
        <MachineDetail
          row={row}
          period={period}
          periodPicker={periodPicker}
          onBack={() => setSelected(null)}
          onToggle={(open) =>
            open
              ? void setOpen(selected, true)
              : ask(`Fermer ${row.m.short} ?`, 'Les joueurs ne pourront plus miser sur cette machine jusqu’à sa réouverture. Une manche de Mines en cours pourra être terminée.', () => setOpen(selected, false))
          }
          maintenance={economy.maintenanceMode}
          showToast={showToast}
          goTo={goTo}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmModal}
      <PageHeader
        title="Machines"
        subtitle="Ouvrez ou fermez le casino et chaque machine en un clic, suivez ce qu'elles rapportent et repérez celles à recalibrer."
        actions={periodPicker}
      />

      {/* Interrupteur général du casino */}
      <section
        className={cx(
          'rounded-2xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4',
          economy.maintenanceMode ? 'border-rose-500/40 bg-rose-500/[0.06]' : 'border-emerald-400/25 bg-emerald-500/[0.04]',
        )}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={cx(
              'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
              economy.maintenanceMode ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300',
            )}
          >
            <Power size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-white">{economy.maintenanceMode ? 'Casino fermé' : 'Casino ouvert'}</div>
            <div className="text-[12px] text-neutral-400">
              {economy.maintenanceMode
                ? 'Maintenance : aucune machine ne peut être jouée, quels que soient les réglages ci-dessous.'
                : `${openCount} machine${openCount > 1 ? 's' : ''} ouverte${openCount > 1 ? 's' : ''} sur ${MACHINES.length}. Le site reste consultable dans tous les cas.`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button onClick={() => ask('Fermer toutes les machines ?', 'Chaque machine passe en « fermée ». Le casino reste ouvert : vous pourrez les rouvrir une par une.', () => setAll(false))}>
            Tout fermer
          </Button>
          <Button onClick={() => void setAll(true)}>Tout ouvrir</Button>
          <Button
            variant={economy.maintenanceMode ? 'primary' : 'danger'}
            onClick={() =>
              economy.maintenanceMode
                ? void setMaintenance(false).then((ok) => ok && showToast('Casino rouvert.'))
                : ask(
                    'Fermer tout le casino ?',
                    `Mode maintenance : tous les jeux et la roue sont bloqués par le serveur. Les joueurs voient le message « ${economy.maintenanceMessage} » (modifiable dans Système).`,
                    async () => {
                      if (await setMaintenance(true)) showToast('Casino fermé (maintenance).');
                    },
                  )
            }
          >
            <Power size={13} /> {economy.maintenanceMode ? 'Rouvrir le casino' : 'Fermer le casino'}
          </Button>
        </div>
      </section>

      {/* Résumé */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Highlight icon={<TrendingUp size={15} />} label={`Bénéfice ${period}`} value={signed(totalProfit)} valueClass={profitClass(totalProfit)} hint="Toutes machines, misé − payé" />
        <Highlight icon={<Flame size={15} />} label="La plus jouée" value={mostPlayed ? mostPlayed.m.short : '—'} hint={mostPlayed ? `${fmt(mostPlayed.s!.summary.rounds)} parties · ${fmt(mostPlayed.s!.summary.players)} joueurs` : 'Aucune partie'} />
        <Highlight icon={<Trophy size={15} />} label="La plus rentable" value={mostProfit ? mostProfit.m.short : '—'} hint={mostProfit ? `${signed(Number(mostProfit.s!.summary.profit))} jetons` : 'Aucune partie'} />
        <Highlight
          icon={<Target size={15} />}
          label="À calibrer"
          value={toCalibrate.length ? toCalibrate.map((r) => r.m.short).join(', ') : 'Aucune'}
          valueClass={toCalibrate.length ? 'text-rose-300' : 'text-emerald-400'}
          hint={worst && Number(worst.s!.summary.profit) < 0 ? `${worst.m.short} fait perdre ${fmt(-Number(worst.s!.summary.profit))} jetons` : 'Tout est dans la normale'}
        />
      </div>

      {/* Machines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map(({ m, s, rtp, target, v }) => {
          const open = gamesConfig[m.id].enabled;
          const profit = Number(s?.summary.profit ?? 0);
          return (
            <section key={m.id} className={cx('rounded-2xl bg-neutral-950 border p-5 flex flex-col gap-4', open ? 'border-white/10' : 'border-rose-500/25')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0">
                    <m.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-white truncate">{m.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge tone={economy.maintenanceMode ? 'bad' : open ? 'good' : 'bad'}>
                        {economy.maintenanceMode ? 'Maintenance' : open ? 'Ouverte' : 'Fermée'}
                      </Badge>
                      <Badge tone={v.tone}>{v.label}</Badge>
                    </div>
                  </div>
                </div>
                <div className="w-12 shrink-0">
                  <Toggle
                    checked={open}
                    onChange={(next) =>
                      next
                        ? void setOpen(m.id, true)
                        : ask(`Fermer ${m.short} ?`, 'Les joueurs ne pourront plus miser sur cette machine jusqu’à sa réouverture.', () => setOpen(m.id, false))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Parties" value={fmt(s?.summary.rounds)} hint={`${fmt(s?.summary.players)} joueur${Number(s?.summary.players) > 1 ? 's' : ''}`} />
                <MiniStat label="Bénéfice casino" value={signed(profit)} valueClass={profitClass(profit)} hint={`misé ${fmt(s?.summary.wagered)}`} />
                <MiniStat
                  label="RTP réel / visé"
                  value={rtp === null ? '—' : `${fmt(rtp, 1)} %`}
                  valueClass={rtp !== null && target !== null && rtp > target + 5 ? 'text-rose-300' : 'text-white'}
                  hint={target === null ? '—' : `visé ${fmt(target, 1)} %`}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-neutral-500 truncate">{v.text}</span>
                <Button size="sm" onClick={() => setSelected(m.id)}>
                  <BarChart3 size={12} /> Détail & réglages
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      <HelpBox title="Comment savoir si une machine est bien calibrée ?">
        <p>
          <b>RTP visé</b> = ce que la machine doit rendre en moyenne selon ses réglages (ex. 96 % : pour 100 000 jetons misés, le casino en
          garde environ 4 000). Pour les machines à sous, il tient compte de ce qui a été joué en tour normal, en boost ou en achat de bonus.
        </p>
        <p>
          <b>RTP réel</b> = ce qu'elle a vraiment rendu sur la période. Au début il varie énormément : un seul gros bonus peut le faire passer
          au-dessus de 100 %. Le badge de calibrage compare les deux en tenant compte du nombre de parties :
        </p>
        <p>
          <Badge tone="neutral">Pas assez de parties</Badge> on ne peut pas encore conclure · <Badge tone="good">Normal</Badge> l'écart est dû au
          hasard · <Badge tone="bad">Trop généreuse</Badge> elle rend nettement trop : montez le prix des bonus, baissez le gain max (ou le
          RTP pour Mines, les lots pour la roue) · <Badge tone="warn">Plus serrée que prévu</Badge> le casino gagne plus que la normale.
        </p>
        <p className="text-neutral-400">Les statistiques couvrent au plus les 30 derniers jours (l'historique plus ancien est purgé chaque nuit).</p>
      </HelpBox>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Détail d'une machine
// ---------------------------------------------------------------------------

type Row = { m: (typeof MACHINES)[number]; s?: AdminGameStats; rtp: number | null; target: number | null; v: Verdict };

const MachineDetail: React.FC<{
  row: Row;
  period: string;
  periodPicker: React.ReactNode;
  onBack: () => void;
  onToggle: (open: boolean) => void;
  maintenance: boolean;
  showToast: (m: string) => void;
  goTo: (t: AdminTab) => void;
}> = ({ row, period, periodPicker, onBack, onToggle, maintenance, showToast, goTo }) => {
  const { gamesConfig, segments } = useCasinoAdmin();
  const [tab, setTab] = useState<'stats' | 'settings'>('stats');
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [row.m.id]);
  const { m, s, rtp, target, v } = row;
  const open = gamesConfig[m.id].enabled;
  const sum = s?.summary;
  const rounds = Number(sum?.rounds ?? 0);
  const profit = Number(sum?.profit ?? 0);
  const maxDaily = Math.max(1, ...(s?.daily ?? []).map((d) => Math.max(Number(d.wagered), Number(d.paid))));
  const hours = Array.from({ length: 24 }, (_, h) => Number(s?.hours.find((x) => x.hour === h)?.rounds ?? 0));
  const maxHour = Math.max(1, ...hours);
  const distTotal = Math.max(1, (s?.distribution ?? []).reduce((a, d) => a + Number(d.rounds), 0));

  return (
    <div ref={topRef} className="flex flex-col gap-6 scroll-mt-6">
      <div className="flex flex-col gap-4 pb-6 border-b border-white/10">
        <button type="button" onClick={onBack} className="self-start flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer">
          <ArrowLeft size={14} /> Toutes les machines
        </button>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0">
              <m.icon size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-white truncate">{m.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge tone={maintenance ? 'bad' : open ? 'good' : 'bad'}>{maintenance ? 'Maintenance' : open ? 'Ouverte' : 'Fermée'}</Badge>
                <Badge tone={v.tone}>{v.label}</Badge>
                <a href={m.route} target="_blank" rel="noreferrer" className="text-[11px] text-neutral-400 hover:text-white inline-flex items-center gap-1">
                  Ouvrir la machine <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={open ? 'danger' : 'primary'} onClick={() => onToggle(!open)}>
              <Power size={13} /> {open ? 'Fermer la machine' : 'Ouvrir la machine'}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'stats', label: 'Statistiques' },
              { value: 'settings', label: 'Réglages' },
            ]}
          />
          {tab === 'stats' && <div className="flex flex-wrap items-center gap-2">{periodPicker}</div>}
        </div>
      </div>

      {tab === 'settings' ? (
        <MachineSettings id={m.id} showToast={showToast} goTo={goTo} />
      ) : !s || rounds === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 size={28} />} title={`Aucune partie ${period}`} hint="Les parties jouées en jetons apparaîtront ici." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Highlight icon={profit >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} label="Bénéfice casino" value={signed(profit)} valueClass={profitClass(profit)} hint={`misé ${fmt(sum!.wagered)} · payé ${fmt(sum!.paid)}`} />
            <Highlight icon={<Flame size={15} />} label="Parties" value={fmt(rounds)} hint={`${fmt(sum!.players)} joueur${Number(sum!.players) > 1 ? 's' : ''} · mise moy. ${fmt(sum!.avg_bet)}`} />
            <Highlight
              icon={<Target size={15} />}
              label="RTP réel / visé"
              value={rtp === null ? '—' : `${fmt(rtp, 1)} %`}
              valueClass={v.tone === 'bad' ? 'text-rose-300' : 'text-white'}
              hint={target === null ? 'Pas de RTP visé' : `visé ${fmt(target, 1)} %`}
            />
            <Highlight
              icon={<Trophy size={15} />}
              label="Plus gros gain"
              value={fmtChips(sum!.biggest_win)}
              hint={`jusqu'à ×${fmt(sum!.biggest_multiplier, 1)} · ${fmt(sum!.win_rate, 1)} % de parties gagnantes`}
            />
          </div>

          <div
            className={cx(
              'rounded-xl border px-4 py-3 text-[13px] flex items-start gap-2',
              v.tone === 'bad' && 'border-rose-500/30 bg-rose-500/[0.06] text-rose-200',
              v.tone === 'warn' && 'border-white/20 bg-white/[0.05] text-neutral-200',
              v.tone === 'good' && 'border-emerald-400/25 bg-emerald-500/[0.05] text-emerald-200',
              v.tone === 'neutral' && 'border-white/10 bg-white/[0.03] text-neutral-300',
            )}
          >
            <Target size={15} className="shrink-0 mt-0.5" />
            <span>
              <b>Calibrage : {v.label}.</b> {v.text}
              {(m.id === 'doghouse' || m.id === 'wanted') && Number(sum!.bonus_rounds) > 0 && (
                <> Bonus déclenché naturellement 1 fois toutes les {fmt(rounds / Number(sum!.bonus_rounds))} parties.</>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title={m.id === 'mines' ? 'Par nombre de mines' : m.id === 'wheel' ? 'Par lot tiré' : 'Par mode de jeu'} icon={<Settings2 size={15} />} padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[460px]">
                  <thead>
                    <tr className="text-[11px] text-neutral-500 text-left border-b border-white/10">
                      <th className="px-5 py-2.5 font-medium">{m.id === 'wheel' ? 'Lot' : 'Mode'}</th>
                      <th className="px-3 py-2.5 font-medium text-right">Parties</th>
                      <th className="px-3 py-2.5 font-medium text-right">Bénéfice</th>
                      <th className="px-5 py-2.5 font-medium text-right">{m.id === 'wheel' ? 'Part' : 'RTP réel / visé'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {s.breakdown.map((b) => {
                      const t = targetFor(m.id, b.key, gamesConfig, segments);
                      const p = Number(b.wagered) - Number(b.paid);
                      return (
                        <tr key={b.key}>
                          <td className="px-5 py-2.5 text-white font-medium">{breakdownLabel(m.id, b.key)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-neutral-300">{fmt(b.rounds)}</td>
                          <td className={cx('px-3 py-2.5 text-right font-mono', profitClass(p))}>{signed(p)}</td>
                          <td className="px-5 py-2.5 text-right font-mono">
                            {m.id === 'wheel' ? (
                              <span className="text-neutral-300">{fmt((Number(b.rounds) / rounds) * 100, 1)} %</span>
                            ) : (
                              <>
                                <span className={cx(t !== null && Number(b.rtp) > t + 10 ? 'text-rose-300' : 'text-white')}>{b.rtp === null ? '—' : `${fmt(b.rtp, 1)} %`}</span>
                                <span className="text-neutral-500 text-xs"> / {t === null ? '—' : `${fmt(t, 1)} %`}</span>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Répartition des résultats" icon={<BarChart3 size={15} />}>
              <div className="flex flex-col gap-2">
                {s.distribution.map((d) => {
                  const pct = (Number(d.rounds) / distTotal) * 100;
                  return (
                    <div key={d.ord} className="grid grid-cols-[88px_1fr_120px] items-center gap-3 text-[12px]">
                      <span className="text-neutral-300">{d.label}</span>
                      <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                        <div className={cx('h-full rounded-full', d.ord === 0 ? 'bg-white/25' : d.ord >= 5 ? 'bg-amber-300' : 'bg-emerald-400/70')} style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                      <span className="text-right font-mono text-neutral-400">
                        {fmt(pct, 1)} % <span className="text-neutral-600">({fmt(d.rounds)})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-500 mt-4">Gain de chaque partie en multiple de la mise. « &lt; ×1 » = le joueur récupère moins que sa mise.</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <Card title="Activité par jour" className="xl:col-span-3">
              <div className="flex items-end gap-1 h-36">
                {s.daily.map((d) => (
                  <div key={d.day} className="flex-1 min-w-0 h-full flex items-end gap-px" title={`${d.day} · ${fmt(d.rounds)} parties · ${fmt(d.players)} joueurs · misé ${fmt(d.wagered)} · payé ${fmt(d.paid)}`}>
                    <div className="flex-1 bg-white/70 rounded-t-sm" style={{ height: `${(Number(d.wagered) / maxDaily) * 100}%` }} />
                    <div className="flex-1 bg-white/30 rounded-t-sm" style={{ height: `${(Number(d.paid) / maxDaily) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1.5">
                {s.daily.map((d, i) => (
                  <span key={d.day} className="flex-1 min-w-0 text-center text-[10px] text-neutral-500 font-mono truncate">
                    {s.daily.length <= 10 || i % Math.ceil(s.daily.length / 8) === 0 ? `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}` : ''}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/70" /> Misé</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/30" /> Payé</span>
                <span className="ml-auto">Survolez une barre pour le détail</span>
              </div>
            </Card>

            <Card title="Heures les plus jouées" icon={<Clock size={15} />} className="xl:col-span-2">
              <div className="flex items-end gap-[3px] h-36">
                {hours.map((n, h) => (
                  <div key={h} className="flex-1 h-full flex items-end" title={`${h} h – ${h + 1} h : ${fmt(n)} parties`}>
                    <div className={cx('w-full rounded-t-sm', n === maxHour && n > 0 ? 'bg-amber-300' : 'bg-white/40')} style={{ height: `${(n / maxHour) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-neutral-500 font-mono">
                <span>0 h</span>
                <span>6 h</span>
                <span>12 h</span>
                <span>18 h</span>
                <span>23 h</span>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <PlayerList title="Joueurs gagnants" empty="Aucun joueur gagnant" players={s.winners} tone="bad" />
            <PlayerList title="Joueurs perdants" empty="Aucun joueur perdant" players={s.losers} tone="good" />
            <Card title="Plus gros gains" icon={<Trophy size={15} />} padded={false}>
              {s.biggest.length === 0 ? (
                <EmptyState title="Aucun gain" />
              ) : (
                <ul className="divide-y divide-white/5">
                  {s.biggest.map((b, i) => (
                    <li key={i} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate">{b.name ?? 'Joueur supprimé'}</div>
                        <div className="text-[11px] text-neutral-500">
                          {fmtDate(b.created_at)} · mise {fmt(b.bet)}
                          {typeof b.result_data?.mode === 'string' && b.result_data.mode !== 'spin' && <> · {breakdownLabel(m.id, String(b.result_data.mode))}</>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-semibold text-white">{fmt(b.win)}</div>
                        <div className="text-[10px] text-neutral-500 font-mono">×{fmt(b.multiplier, 1)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

const PlayerList: React.FC<{ title: string; empty: string; players: AdminGameStats['winners']; tone: 'good' | 'bad' }> = ({ title, empty, players, tone }) => (
  <Card title={title} icon={tone === 'bad' ? <TrendingUp size={15} /> : <TrendingDown size={15} />} right={<span className="text-[10px] text-neutral-500">gain net du joueur</span>} padded={false}>
    {players.length === 0 ? (
      <EmptyState title={empty} />
    ) : (
      <ul className="divide-y divide-white/5">
        {players.map((p) => (
          <li key={p.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                {p.name} <span className="text-neutral-500 font-mono text-xs">#{p.citizen_id}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <RoleBadge role={p.role} />
                <span className="text-[11px] text-neutral-500">{fmt(p.rounds)} parties</span>
              </div>
            </div>
            <span className={cx('font-mono text-sm font-semibold shrink-0', tone === 'bad' ? 'text-rose-300' : 'text-emerald-400')}>{signed(Number(p.net))}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

// ---------------------------------------------------------------------------
// Réglages d'une machine (l'ouverture se fait par le bouton du haut, immédiatement)
// ---------------------------------------------------------------------------

const MachineSettings: React.FC<{ id: MachineId; showToast: (m: string) => void; goTo: (t: AdminTab) => void }> = ({ id, showToast, goTo }) => {
  const { gamesConfig, saveGamesConfig, segments } = useCasinoAdmin();
  const [draft, setDraft] = useState<GamesConfig>(gamesConfig);
  const [saving, setSaving] = useState(false);
  const strip = (c: GamesConfig) => JSON.stringify({ ...c[id], enabled: undefined });
  const dirty = strip(draft) !== strip(gamesConfig);

  // Garde les modifications en cours si l'état ouvert/fermé change entre-temps
  useEffect(() => {
    setDraft((d) => (strip(d) === strip(gamesConfig) ? gamesConfig : { ...gamesConfig, [id]: { ...d[id], enabled: gamesConfig[id].enabled } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamesConfig, id]);

  const set = <G extends MachineId>(game: G, patch: Partial<GamesConfig[G]>) => setDraft((d) => ({ ...d, [game]: { ...d[game], ...patch } }));

  const save = async () => {
    setSaving(true);
    const ok = await saveGamesConfig({ ...gamesConfig, [id]: { ...draft[id], enabled: gamesConfig[id].enabled } });
    setSaving(false);
    if (ok) showToast('Réglages enregistrés, appliqués immédiatement par le serveur.');
  };

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

  const betFields = (g: 'mines' | 'doghouse' | 'wanted') => (
    <Card title="Mises et plafond">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Mise minimum" hint="Plus petite mise acceptée">
          <NumberInput value={draft[g].minBet} min={1} onChange={(v) => set(g, { minBet: v })} suffix="⛁" />
        </Field>
        <Field label="Mise maximum" hint="Plus grosse mise acceptée">
          <NumberInput value={draft[g].maxBet} min={1} onChange={(v) => set(g, { maxBet: v })} suffix="⛁" />
        </Field>
        <Field label="Gain max. par manche" hint="Plafond de sécurité, bonus compris">
          <NumberInput value={draft[g].maxPayout} min={1000} onChange={(v) => set(g, { maxPayout: v })} suffix="⛁" />
        </Field>
      </div>
    </Card>
  );

  const retour = (value: number, price: number) => {
    const r = (value / Math.max(1, price)) * 100;
    return <b className={r > 100 ? 'text-rose-300' : 'text-emerald-300'}>{fmt(r, 0)} %</b>;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20">
        <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setDraft(gamesConfig)} />
      </div>

      {id === 'mines' && (
        <>
          {betFields('mines')}
          <Card title="Taux de retour">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Field label="RTP (taux de retour joueur)" hint={`Le casino garde en moyenne ${fmt(100 - draft.mines.rtp, 1)} % des mises. Entre 80 et 99,5 %.`}>
                <NumberInput value={draft.mines.rtp} min={80} max={99.5} step={0.5} onChange={(v) => set('mines', { rtp: v })} suffix="%" />
              </Field>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                <div className="text-[11px] text-neutral-400 mb-2">Multiplicateurs obtenus avec ce RTP</div>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {minesExamples.map((e) => (
                    <div key={e.mines}>
                      <div className="font-mono text-sm font-bold text-white">×{fmt(e.mult, 2)}</div>
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
          </Card>
        </>
      )}

      {id === 'doghouse' && (
        <>
          {betFields('doghouse')}
          <Card title="Options de jeu">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="flex flex-col gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <Toggle checked={draft.doghouse.buyEnabled} onChange={(v) => set('doghouse', { buyEnabled: v })} label="Achat de bonus" hint="Le joueur paie pour lancer directement les tours gratuits." />
                <Field
                  label="Prix de l'achat (× la mise)"
                  hint={
                    <>
                      Le bonus rapporte ≈ <b>{DOG_BONUS_VALUE}×</b> la mise en moyenne. Retour joueur : {retour(DOG_BONUS_VALUE, draft.doghouse.buyPrice)}
                      {DOG_BONUS_VALUE / draft.doghouse.buyPrice > 1 && ' : le casino PERD de l’argent'}.
                    </>
                  }
                >
                  <NumberInput value={draft.doghouse.buyPrice} min={50} max={1000} onChange={(v) => set('doghouse', { buyPrice: v })} suffix="×" disabled={!draft.doghouse.buyEnabled} />
                </Field>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <Toggle checked={draft.doghouse.boostEnabled} onChange={(v) => set('doghouse', { boostEnabled: v })} label="Boost (Ante Bet)" hint="+25 % de mise pour un bonus environ 1,7× plus fréquent. RTP ≈ 93 %." />
              </div>
            </div>
          </Card>
        </>
      )}

      {id === 'wanted' && (
        <>
          {betFields('wanted')}
          <Card title="Achat de bonus">
            <div className="flex flex-col gap-4">
              <Toggle checked={draft.wanted.buyEnabled} onChange={(v) => set('wanted', { buyEnabled: v })} label="Achat de bonus autorisé" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(
                  [
                    ['gtr', 'Great Train Robbery'],
                    ['duel', 'Duel at Dawn'],
                    ['dmh', "Dead Man's Hand"],
                  ] as const
                ).map(([k, name]) => (
                  <Field key={k} label={`${name} (× la mise)`} hint={<>Vaut ≈ {WANTED_BONUS_VALUE[k]}× · retour {retour(WANTED_BONUS_VALUE[k], draft.wanted.buyPrices[k])}</>}>
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
          </Card>
        </>
      )}

      {id === 'wheel' && (
        <Card title="Prix du tour">
          <div className="flex flex-col gap-4">
            <Field
              label="Prix d'un tour"
              hint={
                <>
                  La roue rend en moyenne {fmt(wheelExpected(segments))} jetons par tour, soit un retour de {retour(wheelExpected(segments), draft.wheel.spinPrice)} (hors véhicules et
                  objets).
                </>
              }
            >
              <NumberInput value={draft.wheel.spinPrice} min={1} onChange={(v) => set('wheel', { spinPrice: v })} suffix="⛁" />
            </Field>
            <div className="text-[13px] text-neutral-400">
              Les lots et leurs chances se règlent dans{' '}
              <button type="button" className="text-white underline cursor-pointer" onClick={() => goTo('wheel')}>
                Roue de la Fortune
              </button>
              .
            </div>
          </div>
        </Card>
      )}

      <HelpBox title="Qu'est-ce que je règle ici ?">
        <p>
          Tout est appliqué <b>par le serveur</b> dès l'enregistrement : un joueur ne peut pas contourner une mise max, un prix de bonus ou un
          gain max, même en modifiant la page.
        </p>
        <p>
          <b>Gain max. par manche</b> : si un tirage dépasse ce plafond, le gain est ramené au plafond. C'est votre garde-fou contre un jackpot
          énorme. <b>Prix des bonus</b> : au-dessus de la valeur moyenne du bonus, le casino gagne sur chaque achat ; en dessous, il perd.
        </p>
      </HelpBox>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Petites briques
// ---------------------------------------------------------------------------

const Highlight: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; hint?: React.ReactNode; valueClass?: string }> = ({ icon, label, value, hint, valueClass }) => (
  <div className="rounded-2xl bg-neutral-950 border border-white/10 p-4 flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between gap-2 text-neutral-500">
      <span className="text-[11px] uppercase tracking-wider font-medium text-neutral-400 truncate">{label}</span>
      {icon}
    </div>
    <div className={cx('text-xl font-bold font-mono tracking-tight truncate', valueClass ?? 'text-white')}>{value}</div>
    {hint && <div className="text-[11px] text-neutral-500 truncate">{hint}</div>}
  </div>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; valueClass?: string }> = ({ label, value, hint, valueClass }) => (
  <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 min-w-0">
    <div className="text-[10px] text-neutral-500 truncate">{label}</div>
    <div className={cx('font-mono text-[15px] font-semibold truncate', valueClass ?? 'text-white')}>{value}</div>
    {hint && <div className="text-[10px] text-neutral-500 truncate">{hint}</div>}
  </div>
);
