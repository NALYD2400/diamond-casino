/**
 * Console → Collections → Concession : véhicules vendus en concession.
 * Seuls ces véhicules ont une valeur de reprise quand un joueur revend un lot.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Car, Search } from 'lucide-react';
import { apiAdminSetVehicleDealership, dbSearchVehicles, type VehicleCatalogEntry } from '../../lib/supabase';
import { Button, Card, HelpBox, Segmented, Toggle, cx, inputClass } from './ui';

type Toast = (m: string, error?: boolean) => void;

const CLASSES = ['SUPER', 'SPORT', 'SPORT_CLASSIC', 'MUSCLE', 'COUPE', 'SEDAN', 'SUV', 'OFF_ROAD', 'COMPACT', 'MOTORCYCLE', 'VAN', 'COMMERCIAL', 'UTILITY', 'INDUSTRIAL', 'SERVICE', 'EMERGENCY', 'MILITARY', 'OPEN_WHEEL', 'HELICOPTER', 'PLANE', 'BOAT', 'CYCLE'];
const selectClass = inputClass.replace('w-full ', '') + ' w-auto bg-neutral-900 text-white cursor-pointer [color-scheme:dark]';
const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('fr-FR')}`;

export const DealershipSection: React.FC<{ showToast: Toast }> = ({ showToast }) => {
  const [query, setQuery] = useState('');
  const [vClass, setVClass] = useState('');
  const [status, setStatus] = useState<'all' | 'in' | 'out'>('all');
  const [rows, setRows] = useState<VehicleCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await dbSearchVehicles(query, { vehicleClass: vClass || undefined, limit: 400 }));
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [query, vClass, showToast]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const list = rows.filter((v) => (status === 'in' ? v.in_dealership : status === 'out' ? !v.in_dealership : true));

  const setMany = async (models: string[], value: boolean, key: string) => {
    if (!models.length) return;
    setBusy(key);
    try {
      const n = await apiAdminSetVehicleDealership(models, value);
      showToast(value ? `${n} véhicule(s) ajouté(s) à la concession.` : `${n} véhicule(s) retiré(s) de la concession.`);
      setRows((l) => l.map((v) => (models.includes(v.model) ? { ...v, in_dealership: value } : v)));
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <HelpBox title="À quoi sert la concession ?" defaultOpen>
        <p>
          Un véhicule gagné (roue de la fortune, lot offert) n'a une <b>valeur de reprise</b> en jetons que s'il est <b>vendu en concession</b>. Le
          catalogue CTG ne l'indique pas : par défaut sont retenus les voitures, motos, vélos et quads avec un vrai prix (≥ 500 $), hors police, secours,
          service, militaire et industriel, et <b>sans les imports</b> (véhicules ajoutés par le serveur, DLC « CTG » et « gabz »). Corrigez ici si besoin.
        </p>
      </HelpBox>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-white/10">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modèle ou marque…" className={cx(inputClass, 'pl-9')} />
          </div>
          <select value={vClass} onChange={(e) => setVClass(e.target.value)} className={selectClass}>
            <option value="">Toutes classes</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'in', label: 'En concession' },
              { value: 'out', label: 'Hors concession' },
            ]}
          />
          <div className="flex gap-2 ml-auto">
            <Button size="sm" loading={busy === 'all-in'} onClick={() => void setMany(list.filter((v) => !v.in_dealership).map((v) => v.model), true, 'all-in')}>
              Tout ajouter ({list.filter((v) => !v.in_dealership).length})
            </Button>
            <Button size="sm" variant="danger" loading={busy === 'all-out'} onClick={() => void setMany(list.filter((v) => v.in_dealership).map((v) => v.model), false, 'all-out')}>
              Tout retirer ({list.filter((v) => v.in_dealership).length})
            </Button>
          </div>
        </div>
        <div className="max-h-[560px] overflow-y-auto divide-y divide-white/5">
          {loading && !rows.length ? (
            <p className="p-4 text-xs text-neutral-500">Chargement…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-xs text-neutral-500">Aucun véhicule.</p>
          ) : (
            list.map((v) => (
              <div key={v.model} className="flex items-center gap-3 px-4 py-2">
                <div className="w-16 h-10 rounded-lg overflow-hidden bg-neutral-900 shrink-0 flex items-center justify-center text-neutral-600">
                  {v.photo_url ? <img src={v.photo_url} alt="" className="w-full h-full object-contain" loading="lazy" /> : <Car size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium truncate">
                    {v.manufacturer ? `${v.manufacturer.charAt(0)}${v.manufacturer.slice(1).toLowerCase()} ` : ''}
                    {v.model}
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate">
                    {['ctg', 'gabz'].includes((v.dlc || '').toLowerCase()) && <span className="text-amber-300 font-semibold">Import · </span>}
                    {(v.class || '').replace(/_/g, ' ')} · {v.type} · {Number(v.price) >= 500 ? fmtMoney(Number(v.price)) : <span className="text-amber-300">prix non renseigné</span>}
                  </div>
                </div>
                <Toggle checked={!!v.in_dealership} disabled={busy !== null} onChange={(val) => void setMany([v.model], val, v.model)} />
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
};
