import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const fsDoc = () => document as FsDocument;
const currentFullscreen = () => fsDoc().fullscreenElement ?? fsDoc().webkitFullscreenElement ?? null;
const fullscreenSupported = () => typeof document !== 'undefined' && !!(fsDoc().fullscreenEnabled || fsDoc().webkitFullscreenEnabled);

/**
 * Met la machine en plein écran : cible l'ancêtre marqué `data-fullscreen-root`
 * (la zone de jeu, avec ses barres de commande). Masqué sur les navigateurs qui
 * ne gèrent pas le plein écran (iPhone notamment).
 */
export const FullscreenButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(false);
  const [supported] = useState(fullscreenSupported);

  useEffect(() => {
    const sync = () => setActive(!!currentFullscreen() && !!ref.current && currentFullscreen()!.contains(ref.current));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      // Quitter la page (Lobby…) sort aussi du plein écran
      if (currentFullscreen()) void (document.exitFullscreen?.() ?? fsDoc().webkitExitFullscreen?.());
    };
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    try {
      if (currentFullscreen()) {
        await (document.exitFullscreen?.() ?? fsDoc().webkitExitFullscreen?.());
        return;
      }
      const root = ref.current?.closest('[data-fullscreen-root]') as FsElement | null;
      if (!root) return;
      await (root.requestFullscreen?.({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.());
    } catch {
      // Refusé par le navigateur : on reste en mode normal
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => void toggle()}
      title={active ? 'Quitter le plein écran' : 'Plein écran'}
      aria-label={active ? 'Quitter le plein écran' : 'Plein écran'}
      className={`flex items-center justify-center rounded-full bg-black/80 hover:bg-black border border-white/20 hover:border-white/40 shadow-lg backdrop-blur-md w-8 h-8 sm:w-9 sm:h-9 text-white transition-all hover:scale-105 active:scale-95 ${className}`}
    >
      {active ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
    </button>
  );
};
