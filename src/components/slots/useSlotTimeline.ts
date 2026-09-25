import { useCallback, useMemo, useRef } from 'react';

/**
 * Séquenceur d'animations partagé par les machines à sous.
 * - `wait` / `countUp` peuvent être écourtés d'un coup par `skipAll` (arrêt rapide).
 * - `waitClick` met la séquence en pause jusqu'à `resolveClick` (écrans « Continuer »).
 */
export function useSlotTimeline() {
  const skipResolvers = useRef<Set<() => void>>(new Set());
  const clickResolver = useRef<(() => void) | null>(null);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(t);
          skipResolvers.current.delete(done);
          resolve();
        };
        const t = setTimeout(done, ms);
        skipResolvers.current.add(done);
      }),
    [],
  );

  const skipAll = useCallback(() => {
    [...skipResolvers.current].forEach((fn) => fn());
  }, []);

  const waitClick = useCallback(
    () =>
      new Promise<void>((resolve) => {
        clickResolver.current = () => {
          clickResolver.current = null;
          resolve();
        };
      }),
    [],
  );

  /** Renvoie true si une pause « clic » était en attente */
  const resolveClick = useCallback(() => {
    if (!clickResolver.current) return false;
    clickResolver.current();
    return true;
  }, []);

  const countUp = useCallback(
    (from: number, to: number, ms: number, onTick: (v: number) => void) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let finished = false;
        // rAF est suspendu dans un onglet en arrière-plan : le timer garantit la fin
        const fallback = setTimeout(() => finish(), ms + 100);
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(fallback);
          skipResolvers.current.delete(finish);
          onTick(to);
          resolve();
        };
        skipResolvers.current.add(finish);
        const step = (now: number) => {
          if (finished) return;
          const p = Math.min(1, (now - start) / ms);
          onTick(from + (to - from) * (1 - Math.pow(1 - p, 2)));
          if (p < 1) requestAnimationFrame(step);
          else finish();
        };
        requestAnimationFrame(step);
      }),
    [],
  );

  return useMemo(
    () => ({ wait, skipAll, waitClick, resolveClick, countUp }),
    [wait, skipAll, waitClick, resolveClick, countUp],
  );
}
