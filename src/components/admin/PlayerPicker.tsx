import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { MockCitizen } from '../../context/CasinoAdminContext';
import { getDefaultDiscordAvatar } from '../../lib/discord';
import { cx, inputClass } from './ui';

const MAX_RESULTS = 8;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const Avatar: React.FC<{ c: MockCitizen; size?: string }> = ({ c, size = 'w-7 h-7' }) => (
  <img
    src={c.avatarUrl || getDefaultDiscordAvatar(c.discordId || c.profileId)}
    alt=""
    className={cx(size, 'rounded-lg object-cover bg-neutral-900 border border-white/10 shrink-0')}
    onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
  />
);

/**
 * Choix d'un joueur par recherche (nom RP, matricule, pseudo Discord, téléphone),
 * à la place d'une liste déroulante illisible quand il y a beaucoup de comptes.
 */
export const PlayerPicker: React.FC<{
  citizens: MockCitizen[];
  value: string;
  onChange: (profileId: string) => void;
  placeholder?: string;
  /** Texte du bouton pour revenir à « aucun joueur » (filtres) */
  clearLabel?: string;
}> = ({ citizens, value, onChange, placeholder = 'Rechercher un joueur : nom, matricule, Discord, téléphone…', clearLabel }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = citizens.find((c) => c.profileId === value);

  const results = useMemo(() => {
    const q = norm(query.trim().replace(/^#/, ''));
    const rows = q
      ? citizens.filter((c) =>
          [`${c.rpFirstName} ${c.rpLastName}`, `${c.rpLastName} ${c.rpFirstName}`, c.citizenId, c.discordTag, c.phoneNumber]
            .filter(Boolean)
            .some((v) => norm(String(v)).includes(q)),
        )
      : [...citizens].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return rows.slice(0, MAX_RESULTS);
  }, [citizens, query]);

  useEffect(() => setActive(0), [query]);

  // Ferme la liste en cliquant ailleurs
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (c: MockCitizen) => {
    onChange(c.profileId);
    setQuery('');
    setOpen(false);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-3 h-10 pl-2 pr-1 rounded-xl bg-white/[0.04] border border-white/20">
        <Avatar c={selected} />
        <span className="min-w-0 flex-1 text-sm text-white truncate">
          {selected.rpFirstName} {selected.rpLastName} <span className="font-mono text-xs text-neutral-500">#{selected.citizenId}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange('')}
          className="h-8 px-2.5 rounded-lg text-[11px] font-semibold text-neutral-400 hover:text-white hover:bg-white/5 flex items-center gap-1 cursor-pointer"
        >
          <X size={12} /> {clearLabel ?? 'Changer'}
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
      <input
        className={cx(inputClass, 'pl-9')}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-white/15 bg-neutral-950 shadow-2xl overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-neutral-500">Aucun joueur ne correspond à « {query} ».</div>
          ) : (
            <>
              {!query.trim() && <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">Derniers inscrits · tapez pour chercher</div>}
              <ul>
                {results.map((c, i) => (
                  <li key={c.profileId}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(c)}
                      className={cx('w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer', i === active ? 'bg-white/10' : 'hover:bg-white/5')}
                    >
                      <Avatar c={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-white truncate">
                          {c.rpFirstName} {c.rpLastName}
                        </span>
                        <span className="block text-[11px] text-neutral-500 truncate">
                          #{c.citizenId}
                          {c.discordTag && ` · ${c.discordTag}`}
                          {c.phoneNumber && ` · ${c.phoneNumber}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!query.trim() && citizens.length > results.length && (
                <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-neutral-500">{citizens.length} joueurs au total</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
