import type { RewardStatus } from './supabase';

export const REWARD_STATUS: Record<RewardStatus, { label: string; className: string }> = {
  IN_INVENTORY: { label: 'Dans l’inventaire', className: 'text-white border-white/20 bg-white/10' },
  CLAIMED: { label: 'Réclamé · en attente', className: 'text-sky-300 border-sky-400/30 bg-sky-500/10' },
  DELIVERED: { label: 'Remis en jeu', className: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' },
  REVOKED: { label: 'Retiré', className: 'text-neutral-400 border-white/15 bg-white/5' },
};

export function formatRewardDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Human-readable vehicle name, e.g. "Pegassi 1016urus" */
export function vehicleDisplayName(manufacturer: string | null | undefined, model: string): string {
  const brand = (manufacturer || '').trim();
  if (!brand) return model;
  return `${brand.charAt(0)}${brand.slice(1).toLowerCase()} ${model}`;
}
