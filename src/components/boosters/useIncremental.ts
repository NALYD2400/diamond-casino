import { useEffect, useRef, useState } from 'react';

/**
 * Affichage progressif d'une longue liste : `step` éléments d'abord, puis les
 * suivants quand le repère (`sentinelRef`) approche de l'écran. Revient au
 * début quand `resetKey` change (nouveau filtre, nouveau tri…).
 */
export function useIncremental<T>(items: T[], step = 40, resetKey?: unknown) {
  const [count, setCount] = useState(step);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setCount(step), [resetKey, step]);

  const hasMore = count < items.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, step, count]);

  return { visible: items.slice(0, count), hasMore, sentinelRef, remaining: Math.max(0, items.length - count) };
}
