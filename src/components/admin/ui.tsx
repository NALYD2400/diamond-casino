/**
 * Briques d'interface de la console de gestion.
 * Un seul style partout : fond noir, cartes neutral-950, bordures white/10,
 * bouton principal blanc, or (amber) réservé aux montants en jetons.
 */
import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Loader2 } from 'lucide-react';

export const fmt = (n: number | null | undefined, digits = 0) =>
  (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits });

export const fmtChips = (n: number | null | undefined) => `${fmt(n)} ⛁`;

export const fmtDate = (iso?: string | number | null, withTime = true) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', withTime
    ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

export const PageHeader: React.FC<{ title: string; subtitle: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10">
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-white">{title}</h1>
      <p className="text-sm text-neutral-400 mt-1 max-w-2xl">{subtitle}</p>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}> = ({ title, icon, right, children, className, padded = true }) => (
  <section className={cx('rounded-2xl bg-neutral-950 border border-white/10', className)}>
    {(title || right) && (
      <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-white min-w-0">
          {icon && <span className="text-neutral-400 shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {right}
      </header>
    )}
    <div className={padded ? 'p-5' : ''}>{children}</div>
  </section>
);

/** Encadré « Comment ça marche » repliable */
export const HelpBox: React.FC<{ title?: string; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title = 'Comment ça marche ?',
  children,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-sky-200">
          <HelpCircle size={15} /> {title}
        </span>
        <ChevronDown size={15} className={cx('text-sky-300 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 text-[13px] leading-relaxed text-neutral-300 space-y-2">{children}</div>}
    </div>
  );
};

export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'gold';
  icon?: React.ReactNode;
}> = ({ label, value, hint, tone = 'default', icon }) => (
  <div className="rounded-2xl bg-neutral-950 border border-white/10 p-5 flex flex-col gap-3 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-medium">{label}</span>
      {icon && <span className="text-neutral-500">{icon}</span>}
    </div>
    <div
      className={cx(
        'text-2xl font-bold font-mono tracking-tight truncate',
        tone === 'good' && 'text-emerald-400',
        tone === 'bad' && 'text-rose-400',
        tone === 'gold' && 'text-amber-300',
        tone === 'default' && 'text-white',
      )}
    >
      {value}
    </div>
    {hint && <div className="text-[11px] text-neutral-500 -mt-1">{hint}</div>}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'gold' | 'violet'; className?: string }> = ({
  children,
  tone = 'neutral',
  className,
}) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap',
      tone === 'neutral' && 'bg-white/5 border-white/10 text-neutral-300',
      tone === 'good' && 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300',
      tone === 'bad' && 'bg-rose-500/10 border-rose-400/25 text-rose-300',
      tone === 'warn' && 'bg-amber-500/10 border-amber-400/25 text-amber-300',
      tone === 'info' && 'bg-sky-500/10 border-sky-400/25 text-sky-300',
      tone === 'gold' && 'bg-yellow-500/10 border-yellow-400/25 text-yellow-300',
      tone === 'violet' && 'bg-violet-500/10 border-violet-400/25 text-violet-300',
      className,
    )}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// Boutons & champs
// ---------------------------------------------------------------------------

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'subtle'; loading?: boolean; size?: 'sm' | 'md' }
> = ({ variant = 'ghost', loading, size = 'md', className, children, disabled, ...rest }) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap',
      size === 'md' ? 'h-9 px-3.5 text-xs' : 'h-7 px-2.5 text-[11px]',
      variant === 'primary' && 'bg-white text-black hover:bg-neutral-200',
      variant === 'ghost' && 'bg-white/5 border border-white/10 text-neutral-200 hover:bg-white/10 hover:text-white',
      variant === 'subtle' && 'text-neutral-400 hover:text-white hover:bg-white/5',
      variant === 'danger' && 'border border-rose-500/30 text-rose-300 hover:bg-rose-500/10',
      className,
    )}
    {...rest}
  >
    {loading && <Loader2 size={13} className="animate-spin" />}
    {children}
  </button>
);

export const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  children,
  className,
}) => (
  <label className={cx('flex flex-col gap-1.5 min-w-0', className)}>
    <span className="text-[11px] font-medium text-neutral-400">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-neutral-500 leading-snug">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/40 transition-colors';

export const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}> = ({ value, onChange, min, max, step = 1, suffix, disabled }) => (
  <div className="relative">
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={cx(inputClass, 'font-mono', suffix && 'pr-12', disabled && 'opacity-50')}
    />
    {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 pointer-events-none">{suffix}</span>}
  </div>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex items-center justify-between gap-4 w-full text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {(label || hint) && (
      <span className="min-w-0">
        {label && <span className="block text-[13px] font-medium text-white">{label}</span>}
        {hint && <span className="block text-[11px] text-neutral-500 mt-0.5">{hint}</span>}
      </span>
    )}
    <span className={cx('relative w-10 h-6 rounded-full shrink-0 transition-colors', checked ? 'bg-emerald-500' : 'bg-white/15')}>
      <span className={cx('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', checked ? 'left-5' : 'left-1')} />
    </span>
  </button>
);

export const Segmented = <T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) => (
  <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        onClick={() => onChange(o.value)}
        className={cx(
          'px-3 h-7 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
          value === o.value ? 'bg-white text-black' : 'text-neutral-400 hover:text-white',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; hint?: string }> = ({ icon, title, hint }) => (
  <div className="py-12 flex flex-col items-center text-center gap-2 text-neutral-500">
    {icon && <div className="opacity-50">{icon}</div>}
    <div className="text-sm font-medium text-neutral-300">{title}</div>
    {hint && <div className="text-xs max-w-sm">{hint}</div>}
  </div>
);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: string }> = ({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
    <div
      className={cx('w-full max-h-[92vh] overflow-y-auto rounded-2xl bg-neutral-950 border border-white/15 shadow-2xl', width)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-neutral-950 z-10">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white text-lg leading-none cursor-pointer px-1">
          ×
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

/** Barre « modifications non enregistrées » */
export const SaveBar: React.FC<{ dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; label?: string }> = ({
  dirty,
  saving,
  onSave,
  onReset,
  label = 'Modifications non enregistrées',
}) =>
  dirty ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-4 py-2.5">
      <span className="text-xs font-medium text-amber-200">{label}</span>
      <div className="flex gap-2">
        <Button variant="subtle" size="sm" onClick={onReset} disabled={saving}>
          Annuler
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={saving}>
          Enregistrer
        </Button>
      </div>
    </div>
  ) : null;

export const ROLE_LABEL: Record<string, string> = {
  FONDATEUR: 'Fondateur',
  DÉVELOPPEUR: 'Développeur',
  'DIRECTEUR CASINO': 'Directeur casino',
  MEMBRE: 'Membre',
};

export const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const tone = role === 'FONDATEUR' ? 'gold' : role === 'DÉVELOPPEUR' ? 'info' : role === 'DIRECTEUR CASINO' ? 'violet' : 'neutral';
  return <Badge tone={tone}>{ROLE_LABEL[role] ?? role}</Badge>;
};

export const VipBadge: React.FC<{ tier?: string | null }> = ({ tier }) =>
  tier ? <Badge tone={tier === 'DIAMOND' ? 'info' : tier === 'GOLD' ? 'gold' : 'neutral'}>VIP {tier}</Badge> : null;
