import React, { useEffect, useState } from 'react';
import { Car, Loader2, Search } from 'lucide-react';
import { dbSearchVehicles, type VehicleCatalogEntry } from '../../lib/supabase';
import { vehicleDisplayName } from '../../lib/rewards';

const CLASSES = ['SUPER', 'SPORT', 'SPORT_CLASSIC', 'MUSCLE', 'COUPE', 'SEDAN', 'SUV', 'OFF_ROAD', 'MOTORCYCLE', 'COMPACT', 'VAN', 'HELICOPTER', 'PLANE', 'BOAT'];

interface VehiclePickerProps {
  selectedModel?: string | null;
  onSelect: (vehicle: VehicleCatalogEntry) => void;
  /** Max height of the results list */
  className?: string;
}

/** Searchable picker over the vehicle catalogue (model / brand, class filter) */
export const VehiclePicker: React.FC<VehiclePickerProps> = ({ selectedModel, onSelect, className = 'max-h-72' }) => {
  const [query, setQuery] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [results, setResults] = useState<VehicleCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      dbSearchVehicles(query, { vehicleClass: vehicleClass || undefined, limit: 40 })
        .then((rows) => {
          if (!cancelled) {
            setResults(rows);
            setError(null);
          }
        })
        .catch((err) => !cancelled && setError((err as Error).message))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, vehicleClass]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Modèle ou marque (ex. urus, pegassi)…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
          />
        </div>
        <select
          value={vehicleClass}
          onChange={(e) => setVehicleClass(e.target.value)}
          className="h-10 px-2 rounded-xl bg-neutral-900 border border-white/10 text-xs text-neutral-300 focus:outline-none cursor-pointer"
          aria-label="Classe de véhicule"
        >
          <option value="">Toutes classes</option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className={`overflow-y-auto rounded-xl border border-white/10 bg-black/40 divide-y divide-white/5 ${className}`}>
        {loading && results.length === 0 ? (
          <div className="p-4 text-xs text-neutral-500 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Recherche…
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-red-400">{error}</div>
        ) : results.length === 0 ? (
          <div className="p-4 text-xs text-neutral-500">
            Aucun véhicule. Le catalogue est-il importé (onglet Lots &amp; Véhicules) ?
          </div>
        ) : (
          results.map((v) => {
            const active = v.model === selectedModel;
            return (
              <button
                key={v.model}
                type="button"
                onClick={() => onSelect(v)}
                className={`w-full flex items-center gap-3 p-2.5 text-left transition-colors cursor-pointer ${
                  active ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <div className="w-16 h-10 rounded-lg overflow-hidden bg-neutral-900 shrink-0 flex items-center justify-center text-neutral-600">
                  {v.photo_url ? (
                    <img src={v.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Car size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${active ? 'text-white' : 'text-white'}`}>
                    {vehicleDisplayName(v.manufacturer, v.model)}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-500 truncate">
                    {v.model} · {(v.class || '').replace('_', ' ')}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-neutral-400 shrink-0" title="Prix concession">
                  {v.price ? v.price.toLocaleString('fr-FR') : '—'}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
