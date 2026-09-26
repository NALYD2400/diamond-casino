import React, { useState } from 'react';
import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';

export interface GameVolumeProps {
  muted: boolean;
  volume: number;
  onMute: () => void;
  onVolumeChange: (vol: number) => void;
  accentClass?: string;
  className?: string;
}

/**
 * Bouton de volume interactif pour la barre inférieure de jeu :
 * - Icône dynamique (VolumeX, Volume1, Volume2)
 * - Clic sur l'icône = bascule sourdine
 * - Survol / Focus = déploiement fluide d'un curseur de réglage précis (0 à 100 %)
 */
export const GameVolumeButton: React.FC<GameVolumeProps> = ({
  muted,
  volume,
  onMute,
  onVolumeChange,
  accentClass = 'accent-amber-400',
  className = '',
}) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);

  const open = hovered || focused || dragging;
  const effectiveVol = muted ? 0 : volume;

  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const percent = Math.round(effectiveVol * 100);

  return (
    <div
      className={`relative flex items-center group/vol ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
    >
      <button
        onClick={onMute}
        title={muted ? 'Activer le son' : `Couper le son (${percent} %)`}
        aria-label="Contrôle du volume"
        className="p-1 rounded-md text-white/80 hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-white/40"
      >
        <Icon size={18} />
      </button>

      {/* Curseur dépliable au survol / focus / glissement */}
      <div
        className={`flex items-center transition-all duration-200 overflow-hidden ${
          open ? 'w-24 sm:w-28 opacity-100 ml-1.5' : 'w-0 opacity-0 ml-0 pointer-events-none'
        }`}
      >
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={effectiveVol}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={() => setDragging(false)}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          title={`Volume : ${percent} %`}
          aria-label="Curseur de volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%`}
          className={`w-full h-1.5 rounded-full bg-white/20 cursor-pointer ${accentClass}`}
        />
        <span className="text-[10px] font-mono text-white/70 ml-1.5 w-6 text-right select-none">
          {percent}%
        </span>
      </div>
    </div>
  );
};

/**
 * Rangée de réglage du volume pour les modales Paramètres / Menu des jeux
 */
export const GameVolumeModalRow: React.FC<GameVolumeProps & { label?: string }> = ({
  muted,
  volume,
  onMute,
  onVolumeChange,
  accentClass = 'accent-amber-400',
  label = 'Volume des effets sonores',
}) => {
  const effectiveVol = muted ? 0 : volume;
  const percent = Math.round(effectiveVol * 100);
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="rounded-xl bg-black/40 border border-white/10 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-white/10 text-white">
            <Icon size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">{label}</div>
            <div className="text-xs text-white/50">
              {muted ? 'Son actuellement coupé' : `${percent} %`}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onMute}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            muted
              ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
          }`}
        >
          {muted ? 'Activer' : 'Couper'}
        </button>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <VolumeX size={15} className="text-white/40 shrink-0" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={effectiveVol}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          aria-label="Volume"
          className={`w-full h-2 rounded-full bg-white/15 cursor-pointer ${accentClass}`}
        />
        <Volume2 size={15} className="text-white/80 shrink-0" />
        <span className="text-xs font-mono font-bold text-white w-9 text-right shrink-0">
          {percent}%
        </span>
      </div>
    </div>
  );
};
