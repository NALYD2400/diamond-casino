import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, ScrollText, Search } from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import type { LogCategory } from '../../lib/supabase';
import { Badge, Button, EmptyState, PageHeader, Segmented, cx, inputClass } from './ui';

const CATEGORY: Record<LogCategory, { label: string; tone: 'info' | 'gold' | 'violet' | 'neutral' }> = {
  CITIZEN: { label: 'Joueurs', tone: 'violet' },
  ECONOMY: { label: 'Jetons & jeux', tone: 'gold' },
  WHEEL: { label: 'Roue', tone: 'info' },
  SYSTEM: { label: 'Système', tone: 'neutral' },
};

export const LogsPanel: React.FC = () => {
  const { logs, refreshLogs } = useCasinoAdmin();
  const [category, setCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter(
      (l) => (category === 'ALL' || l.category === category) && (!q || `${l.action} ${l.detail} ${l.author}`.toLowerCase().includes(q)),
    );
  }, [logs, category, query]);

  const exportCsv = () => {
    const rows = [['date', 'categorie', 'action', 'detail', 'auteur'], ...list.map((l) => [l.createdAt || l.timestamp, l.category, l.action, l.detail, l.author])];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal_casino_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Journal"
        subtitle="Chaque action sensible est écrite par le serveur (auteur réel, impossible à falsifier ou à effacer depuis la console) : soldes, rôles, VIP, réglages, lots, maintenance."
        actions={
          <>
            <Button onClick={exportCsv} disabled={list.length === 0}>
              <Download size={13} /> Export CSV
            </Button>
            <Button
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await refreshLogs();
                setRefreshing(false);
              }}
            >
              <RefreshCw size={13} /> Actualiser
            </Button>
          </>
        }
      />

      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input className={cx(inputClass, 'pl-9')} placeholder="Rechercher (joueur, matricule, auteur…)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Segmented
          value={category}
          onChange={setCategory}
          options={[
            { value: 'ALL', label: 'Tout' },
            ...(Object.keys(CATEGORY) as LogCategory[]).map((c) => ({ value: c, label: CATEGORY[c].label })),
          ]}
        />
      </div>

      <div className="rounded-2xl bg-neutral-950 border border-white/10 overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<ScrollText size={30} />} title="Aucune entrée" hint="Les 200 dernières actions s'affichent ici." />
        ) : (
          <ul className="divide-y divide-white/5">
            {list.map((l) => (
              <li key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3 hover:bg-white/[0.02]">
                <div className="flex items-start gap-3 min-w-0">
                  <Badge tone={CATEGORY[l.category]?.tone ?? 'neutral'} className="mt-0.5 shrink-0">
                    {CATEGORY[l.category]?.label ?? l.category}
                  </Badge>
                  <div className="min-w-0">
                    <div className="text-[13px] text-white">{l.detail}</div>
                    <div className="text-[11px] text-neutral-500">{l.action}</div>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 shrink-0 sm:text-right">
                  <div className="text-neutral-300">{l.author}</div>
                  <div className="font-mono">{l.timestamp}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
