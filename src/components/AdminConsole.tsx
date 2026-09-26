import React, { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  Crown,
  Disc,
  Gamepad2,
  LayoutDashboard,
  Lock,
  ScrollText,
  Server,
  Users,
} from 'lucide-react';
import { useCasinoAdmin } from '../context/CasinoAdminContext';
import { useCasinoUser } from '../context/CasinoUserContext';
import { hasAdminPermissions } from '../lib/discord';
import { DashboardPanel } from './admin/DashboardPanel';
import { PlayersPanel } from './admin/PlayersPanel';
import { MachinesPanel } from './admin/MachinesPanel';
import { WheelPanel } from './admin/WheelPanel';
import { VipPanel } from './admin/VipPanel';
import { RewardsPanel } from './admin/RewardsPanel';
import { LogsPanel } from './admin/LogsPanel';
import { SystemPanel } from './admin/SystemPanel';
import { ROLE_LABEL, cx } from './admin/ui';

export type AdminTab = 'dashboard' | 'players' | 'games' | 'wheel' | 'vip' | 'rewards' | 'logs' | 'system';

const TABS: AdminTab[] = ['dashboard', 'players', 'games', 'wheel', 'vip', 'rewards', 'logs', 'system'];

interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Pilotage',
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, description: 'Bénéfices, activité, alertes' },
      { id: 'games', label: 'Machines', icon: Gamepad2, description: 'Ouvrir, fermer, stats, calibrage' },
      { id: 'wheel', label: 'Lots de la roue', icon: Disc, description: 'Lots, chances, prix' },
    ],
  },
  {
    group: 'Joueurs',
    items: [
      { id: 'players', label: 'Joueurs', icon: Users, description: 'Comptes, soldes, fiches' },
      { id: 'vip', label: 'VIP', icon: Crown, description: 'Demandes et offres' },
      { id: 'rewards', label: 'Lots & véhicules', icon: Car, description: 'Livraisons en jeu' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { id: 'logs', label: 'Journal', icon: ScrollText, description: 'Qui a fait quoi' },
      { id: 'system', label: 'Système', icon: Server, description: 'Maintenance, export, tests' },
    ],
  },
];

function readHashTab(): AdminTab | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash.replace('#', '');
  if (h === 'dev') return 'system';
  return (TABS as string[]).includes(h) ? (h as AdminTab) : null;
}

interface AdminConsoleProps {
  /** « dev » est conservé pour la route /dev (ouvre l'onglet Système) */
  initialTab?: AdminTab | 'dev';
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ initialTab }) => {
  const { user, isLoading } = useCasinoUser();
  const { lastError, vipRequests, dashboard, economy } = useCasinoAdmin();

  const [tab, setTab] = useState<AdminTab>(() => readHashTab() ?? (initialTab === 'dev' ? 'system' : initialTab) ?? 'dashboard');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  const showToast = (text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500);
  };

  // Les refus du serveur (droits, valeurs invalides…) s'affichent en rouge
  useEffect(() => {
    if (lastError) showToast(lastError.message, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastError]);

  const goTo = (t: AdminTab) => {
    setTab(t);
    try {
      window.history.replaceState(null, '', `#${t}`);
    } catch {}
  };

  if (isLoading) {
    return <div className="w-full h-screen bg-black text-neutral-400 flex items-center justify-center text-xs tracking-[3px] uppercase">Vérification des accès…</div>;
  }

  if (!hasAdminPermissions(user)) {
    return (
      <div className="w-full h-screen bg-black text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full p-8 rounded-2xl bg-neutral-950 border border-white/10 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Lock size={26} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Accès réservé à la direction</h1>
            <p className="text-sm text-neutral-400 mt-1">Connectez-vous avec un compte Fondateur, Développeur ou Directeur casino.</p>
          </div>
          <Link to="/espace-membre" className="w-full h-10 rounded-xl bg-white text-black text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            <ArrowLeft size={14} /> Espace membre
          </Link>
        </div>
      </div>
    );
  }

  const badges: Partial<Record<AdminTab, number>> = {
    vip: vipRequests.length,
    rewards: dashboard?.totals.pending_rewards ?? 0,
  };
  const current = NAV.flatMap((g) => g.items).find((i) => i.id === tab)!;

  return (
    <div className="w-full h-screen overflow-hidden bg-black text-white flex flex-col antialiased">
      {toast && (
        <div
          className={cx(
            'fixed top-5 right-5 z-[60] max-w-sm px-4 py-3 rounded-xl text-[13px] font-medium shadow-2xl flex items-start gap-2 border',
            toast.error ? 'bg-rose-950 border-rose-500/40 text-rose-100' : 'bg-white text-black border-white',
          )}
        >
          {!toast.error && <CheckCircle2 size={16} className="shrink-0 mt-px" />}
          <span>{toast.text}</span>
        </div>
      )}

      <header className="h-14 shrink-0 border-b border-white/10 px-4 sm:px-6 flex items-center justify-between gap-4 bg-black">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/espace-membre" className="h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-neutral-300 hover:text-white flex items-center gap-1.5 text-xs shrink-0">
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Site</span>
          </Link>
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight truncate">Console de gestion</div>
            <div className="text-[11px] text-neutral-500 leading-tight truncate hidden sm:block">Diamond Casino · {current.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => goTo('games')}
            className={cx(
              'hidden sm:flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-semibold cursor-pointer',
              economy.maintenanceMode ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
            )}
          >
            <span className={cx('w-1.5 h-1.5 rounded-full', economy.maintenanceMode ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse')} />
            {economy.maintenanceMode ? 'Maintenance' : 'Casino ouvert'}
          </button>
          <div className="flex items-center gap-2">
            <img src={user?.avatarUrl} alt="" className="w-7 h-7 rounded-full bg-neutral-900 border border-white/10 object-cover" />
            <div className="hidden md:block leading-tight">
              <div className="text-xs font-semibold">
                {user?.rpFirstName} {user?.rpLastName}
              </div>
              <div className="text-[10px] text-neutral-500">{ROLE_LABEL[user?.role ?? ''] ?? user?.role}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation mobile */}
      <nav className="lg:hidden shrink-0 border-b border-white/10 overflow-x-auto">
        <div className="flex gap-1 px-3 py-2 w-max">
          {NAV.flatMap((g) => g.items).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(item.id)}
              className={cx(
                'h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                tab === item.id ? 'bg-white text-black' : 'text-neutral-400 hover:text-white',
              )}
            >
              <item.icon size={14} />
              {item.label}
              {!!badges[item.id] && <span className="ml-0.5 px-1.5 rounded-full bg-white text-black text-[10px] font-bold">{badges[item.id]}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 flex min-h-0">
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-white/10 flex-col gap-6 p-4 overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{g.group}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goTo(item.id)}
                      className={cx(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer',
                        active ? 'bg-white text-black' : 'text-neutral-300 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <item.icon size={16} className={active ? 'text-black' : 'text-neutral-500'} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
                        <span className={cx('block text-[11px] leading-tight truncate', active ? 'text-black/60' : 'text-neutral-500')}>{item.description}</span>
                      </span>
                      {!!badges[item.id] && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-white text-black text-[11px] font-bold flex items-center justify-center">
                          {badges[item.id]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
            {tab === 'dashboard' && <DashboardPanel goTo={goTo} />}
            {tab === 'players' && <PlayersPanel showToast={showToast} />}
            {tab === 'games' && <MachinesPanel showToast={showToast} goTo={goTo} />}
            {tab === 'wheel' && <WheelPanel showToast={showToast} />}
            {tab === 'vip' && <VipPanel showToast={showToast} />}
            {tab === 'rewards' && <RewardsPanel showToast={showToast} />}
            {tab === 'logs' && <LogsPanel />}
            {tab === 'system' && <SystemPanel showToast={showToast} />}
          </div>
        </main>
      </div>
    </div>
  );
};
