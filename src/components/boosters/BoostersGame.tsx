/**
 * BOOSTERS — ouverture de paquets de cartes véhicules.
 *
 * 1. Choix du booster (carrousel)            → le joueur paie (open_booster côté serveur)
 * 2. Ouverture : glisser le long du haut du paquet pour le déchirer
 * 3. Révélation carte par carte (effets selon la rareté)
 * 4. Récapitulatif : les véhicules sont déjà dans l'inventaire du joueur
 *
 * Tout le tirage est fait par le serveur ; la page ne fait que la mise en scène.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Gem, Info, Loader2, Package, ShieldCheck, X } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import { apiBoosterCatalog, apiOpenBooster, apiSellRewards, type BoosterCatalog, type BoosterCardData, type BoosterPackData, type OpenBoosterResult } from '../../lib/supabase';
import { FullscreenButton } from '../FullscreenButton';
import { GameVolumeButton } from '../VolumeControl';
import { MachineClosedBanner, useMachineClosed } from '../MachineClosedBanner';
import { BoosterCardBack, BoosterCardFace } from './BoosterCard';
import { BoosterPack } from './BoosterPack';
import { BoosterAudio } from './boosterAudio';
import { useIncremental } from './useIncremental';
import { fmtChips, fmtMoney, packOdds, rarityMap, rarityTier, resolveCard, rgba, type ResolvedCard } from './boosterUtils';

type Stage = 'select' | 'opening' | 'reveal' | 'summary';

const VOLUME_KEY = 'boosters_volume';

function useViewport() {
  const [size, setSize] = useState(() => ({ w: typeof window === 'undefined' ? 1280 : window.innerWidth, h: typeof window === 'undefined' ? 800 : window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    document.addEventListener('fullscreenchange', on);
    return () => {
      window.removeEventListener('resize', on);
      document.removeEventListener('fullscreenchange', on);
    };
  }, []);
  return size;
}

/** Taille d'un élément (ResizeObserver) */
function useElementSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}

// ---------------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------------

const Burst: React.FC<{ color: string; count: number; spread: number }> = ({ color, count, spread }) => {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const d = spread * (0.45 + Math.random() * 0.75);
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 3 + Math.random() * 6, delay: Math.random() * 0.12, white: Math.random() < 0.35 };
      }),
    [count, spread],
  );
  return (
    <div className="absolute left-1/2 top-1/2 pointer-events-none z-30">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2, background: p.white ? '#fff' : color, boxShadow: `0 0 10px ${color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 1.1 + Math.random() * 0.5, delay: p.delay, ease: [0.1, 0.8, 0.3, 1] }}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const BoostersGame: React.FC = () => {
  const { user, isAuthenticated, applyServerProfile, refreshProfile } = useCasinoUser();
  const closedState = useMachineClosed('boosters');
  const { gamesConfig } = useCasinoAdmin();
  const sellRate = gamesConfig.boosters.sellRate;
  const [sold, setSold] = useState<number | null>(null);
  const [selling, setSelling] = useState(false);
  // « Réduire les animations » : on coupe seulement le tremblement d'écran et le flash
  const calm = useReducedMotion();
  const { w: vw, h: vh } = useViewport();
  const [carouselRef, carousel] = useElementSize<HTMLDivElement>();

  const [catalog, setCatalog] = useState<BoosterCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('select');
  const [oddsOpen, setOddsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<OpenBoosterResult | null>(null);
  const [openingPack, setOpeningPack] = useState<BoosterPackData | null>(null);
  const [torn, setTorn] = useState(false);
  const [autoTear, setAutoTear] = useState(false);
  const [cardsOut, setCardsOut] = useState(false);

  // Révélation
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [charging, setCharging] = useState(false);
  const [effectKey, setEffectKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const busy = useRef(false);

  // Son
  const audio = useRef<BoosterAudio | null>(null);
  if (!audio.current) audio.current = new BoosterAudio();
  const [volume, setVolume] = useState(() => {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? v : 0.8;
    } catch {
      return 0.8;
    }
  });
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    audio.current!.volume = volume;
    audio.current!.muted = muted;
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {}
  }, [volume, muted]);

  const load = useCallback(() => {
    apiBoosterCatalog(false)
      .then((c) => {
        setCatalog(c);
        setLoadError(null);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const rarities = useMemo(() => rarityMap(catalog?.rarities ?? []), [catalog]);
  const cardsById = useMemo(() => Object.fromEntries((catalog?.cards ?? []).map((c) => [c.id, c])), [catalog]);
  const packs = useMemo(() => (catalog?.packs ?? []).filter((p) => p.cards.length > 0), [catalog]);
  const pack = packs[Math.min(index, Math.max(0, packs.length - 1))];

  const drawn: ResolvedCard[] = useMemo(() => (result ? result.cards.map((c) => resolveCard(c, rarities)) : []), [result, rarities]);

  const closed = closedState !== null;
  const balance = user?.chips ?? 0;
  const canAfford = !!pack && balance >= pack.price;

  // Dimensions
  const stageH = Math.max(640, vh - 90);
  const cardW = Math.round(Math.max(190, Math.min(300, (stageH - 250) / 1.4, vw - 70)));
  const packW = Math.round(Math.max(170, Math.min(250, (stageH - 300) / 1.62, vw - 120)));
  // Carrousel : le paquet tient dans la place restante entre le titre et les boutons
  const selectPackW = Math.round(Math.max(96, Math.min(250, carousel.h ? (carousel.h - 56) / 1.62 : packW, vw - 140)));

  // ------------------------------------------------------------------ actions

  const buy = async (target: BoosterPackData | undefined = pack) => {
    if (!target || busy.current) return;
    audio.current!.unlock();
    setError(null);
    if (!isAuthenticated) return;
    busy.current = true;
    setOpeningPack(target);
    setSold(null);
    setResult(null);
    setTorn(false);
    setAutoTear(false);
    setCardsOut(false);
    setCurrent(0);
    setFlipped(false);
    setStage('opening');
    try {
      const res = await apiOpenBooster(target.id);
      applyServerProfile(res.profile);
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
      setStage('select');
      load();
    } finally {
      busy.current = false;
    }
  };

  // Le paquet est déchiré ET le résultat est arrivé → les cartes sortent
  useEffect(() => {
    if (stage !== 'opening' || !torn || !result) return;
    const t1 = window.setTimeout(() => {
      setCardsOut(true);
      audio.current!.slide();
    }, 350);
    const t2 = window.setTimeout(() => setStage('reveal'), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [stage, torn, result]);

  const onTorn = () => {
    setTorn(true);
    audio.current!.tear();
  };

  const finish = useCallback(() => {
    setStage('summary');
    void refreshProfile().catch(() => {});
  }, [refreshProfile]);

  /** Tap sur la carte du dessus : retourne, puis passe à la suivante */
  const advance = useCallback(() => {
    if (stage !== 'reveal' || charging || !drawn.length) return;
    const card = drawn[current];
    if (!flipped) {
      const tier = rarityTier(card.rarity);
      const doFlip = () => {
        setCharging(false);
        setFlipped(true);
        setEffectKey((k) => k + 1);
        audio.current!.flip();
        if (tier >= 3 && !calm) {
          setFlash(tier >= 4 ? card.color : '#ffffff');
          setShake(true);
          window.setTimeout(() => setFlash(null), 450);
          window.setTimeout(() => setShake(false), 500);
        }
      };
      if (tier >= 3) {
        setCharging(true);
        const d = tier >= 4 ? 1.7 : 1.0;
        window.setTimeout(doFlip, d * 1000);
      } else doFlip();
      return;
    }
    audio.current!.swipe();
    if (current + 1 >= drawn.length) finish();
    else {
      setFlipped(false);
      setCurrent((c) => c + 1);
    }
  }, [stage, charging, drawn, current, flipped, calm, finish]);

  const revealAll = () => {
    finish();
  };

  // Clavier : espace / entrée pour avancer
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      if ((e.target as HTMLElement)?.closest('input, textarea, select, button')) return;
      e.preventDefault();
      if (stage === 'reveal') advance();
      else if (stage === 'opening' && !torn) setAutoTear(true);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [stage, advance, torn]);

  const backToSelect = () => {
    setStage('select');
    setResult(null);
    setOpeningPack(null);
  };

  // ------------------------------------------------------------------ rendu

  const summary = useMemo(() => {
    if (!result) return null;
    const best = [...drawn].sort((a, b) => b.rarity.sort - a.rarity.sort || b.value - a.value)[0];
    return { total: result.total_value, price: result.price, best };
  }, [result, drawn]);

  return (
    <div className="relative bg-black pt-[80px] sm:pt-[90px]">
      <MachineClosedBanner state={closedState} demo={false} />
      <div data-fullscreen-root className="relative w-full overflow-hidden select-none bg-black" style={{ height: 'max(640px, calc(100svh - 90px))' }}>
        {/* Fond vidéo (identique à l'accueil) */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <video src="/hero_diamants.mp4" className="w-full h-full object-cover" autoPlay loop muted playsInline />
        </div>
        <motion.div
          className="absolute inset-0 z-[1] bg-black pointer-events-none"
          animate={{ opacity: stage === 'select' ? 0.45 : charging ? 0.9 : 0.72 }}
          transition={{ duration: 0.6 }}
        />
        <div className="absolute bottom-0 inset-x-0 h-48 sm:h-72 bg-gradient-to-t from-black via-black/70 to-transparent z-[1] pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-black/80 to-transparent z-[1] pointer-events-none" />

        {/* Barre du haut */}
        <div className="absolute top-8 sm:top-10 left-3 sm:left-6 right-3 sm:right-6 z-40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link
              to="/jeux"
              className="flex items-center gap-2 rounded-full bg-black/80 hover:bg-black border border-white/20 hover:border-white/40 shadow-lg backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft size={16} /> Lobby
            </Link>
            <FullscreenButton />
            <div className="hidden sm:flex rounded-full bg-black/80 border border-white/20 backdrop-blur-md px-2 h-9 items-center">
              <GameVolumeButton muted={muted} volume={volume} onMute={() => setMuted((m) => !m)} onVolumeChange={(v) => { setVolume(v); setMuted(false); }} accentClass="accent-white" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stage === 'reveal' && (
              <button
                type="button"
                onClick={revealAll}
                className="rounded-full liquid-glass border border-white/20 hover:bg-white/10 px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white"
              >
                Tout révéler
              </button>
            )}
            <div className="rounded-full bg-black/80 border border-white/20 shadow-lg backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white font-mono">
              {isAuthenticated ? fmtChips(balance) : 'Non connecté'}
            </div>
          </div>
        </div>

        {/* Contenu */}
        <motion.div className="absolute inset-0 z-10" animate={shake ? { x: [0, -8, 7, -5, 4, 0], y: [0, 4, -5, 3, -2, 0] } : { x: 0, y: 0 }} transition={{ duration: 0.45 }}>
          <AnimatePresence mode="wait">
            {stage === 'select' && (
              <motion.div key="select" className="absolute inset-0 flex flex-col items-center pt-[92px] sm:pt-[104px] pb-6 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
                <div className="text-center">
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-white/60">The Diamond Casino · Collection</p>
                  <h1 className="mt-1 text-4xl sm:text-6xl text-white leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
                    Boosters <span className="italic text-white/70">véhicules</span>
                  </h1>
                </div>

                {!catalog && !loadError && (
                  <div className="flex-1 flex items-center justify-center text-white/60 text-sm gap-2">
                    <Loader2 className="animate-spin" size={16} /> Chargement des boosters…
                  </div>
                )}
                {loadError && <div className="flex-1 flex items-center justify-center text-rose-300 text-sm">{loadError}</div>}
                {catalog && packs.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-white/70">
                    <Package size={40} className="opacity-60" />
                    <p className="text-sm">Aucun booster disponible pour le moment.</p>
                    <p className="text-xs text-white/40">La direction prépare les prochaines collections.</p>
                  </div>
                )}

                {pack && (
                  <>
                    <div ref={carouselRef} className="relative flex-1 w-full flex items-center justify-center min-h-0">
                      {packs.length > 1 && (
                        <button type="button" onClick={() => setIndex((i) => (i - 1 + packs.length) % packs.length)} className="absolute left-0 sm:left-[8%] z-20 w-11 h-11 rounded-full liquid-glass border border-white/20 text-white flex items-center justify-center hover:bg-white/10" aria-label="Booster précédent">
                          <ChevronLeft size={20} />
                        </button>
                      )}
                      <div className="relative flex items-center justify-center" style={{ height: selectPackW * 1.62 }}>
                        {packs.map((p, i) => {
                          const off = i - index;
                          const wrapped = Math.abs(off) > packs.length / 2 ? off - Math.sign(off) * packs.length : off;
                          if (Math.abs(wrapped) > 2) return null;
                          return (
                            <motion.button
                              key={p.id}
                              type="button"
                              onClick={() => (wrapped === 0 ? undefined : setIndex(i))}
                              className="absolute"
                              style={{ zIndex: 10 - Math.abs(wrapped), cursor: wrapped === 0 ? 'default' : 'pointer' }}
                              animate={{
                                x: wrapped * selectPackW * (vw < 640 ? 0.55 : 0.78),
                                scale: wrapped === 0 ? 1 : 0.72,
                                opacity: wrapped === 0 ? 1 : 0.45,
                                filter: wrapped === 0 ? 'brightness(1)' : 'brightness(0.55)',
                              }}
                              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                            >
                              <div className={wrapped === 0 ? 'bst-float' : ''}>
                                <BoosterPack pack={p} width={selectPackW} idle={wrapped === 0} interactive={wrapped === 0} baseRotateY={wrapped * -28} />
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                      {packs.length > 1 && (
                        <button type="button" onClick={() => setIndex((i) => (i + 1) % packs.length)} className="absolute right-0 sm:right-[8%] z-20 w-11 h-11 rounded-full liquid-glass border border-white/20 text-white flex items-center justify-center hover:bg-white/10" aria-label="Booster suivant">
                          <ChevronRight size={20} />
                        </button>
                      )}
                    </div>

                    <div className="w-full max-w-md flex flex-col items-center text-center gap-3 mt-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{pack.name}</h2>
                        {pack.description && <p className="text-xs sm:text-sm text-white/60 mt-1">{pack.description}</p>}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/80">
                        <span className="rounded-full bg-white/10 border border-white/15 px-2.5 py-1">{pack.cards_per_pack} carte{pack.cards_per_pack > 1 ? 's' : ''}</span>
                        {pack.guaranteed_rarity && rarities[pack.guaranteed_rarity] && (
                          <span className="rounded-full px-2.5 py-1 flex items-center gap-1 border" style={{ color: rarities[pack.guaranteed_rarity].color, borderColor: rgba(rarities[pack.guaranteed_rarity].color, 0.4), background: rgba(rarities[pack.guaranteed_rarity].color, 0.12) }}>
                            <ShieldCheck size={12} /> 1 {rarities[pack.guaranteed_rarity].label} ou mieux garantie
                          </span>
                        )}
                        <span className="rounded-full bg-white/10 border border-white/15 px-2.5 py-1">Véhicules livrés dans l'inventaire</span>
                      </div>
                      {error && <p className="text-sm text-rose-300">{error}</p>}
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {isAuthenticated ? (
                          <button
                            type="button"
                            onClick={() => void buy()}
                            disabled={closed || !canAfford}
                            className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 sm:px-9 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.35)] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
                          >
                            {closed ? 'Boosters fermés' : !canAfford ? `Solde insuffisant · ${fmtChips(pack.price)}` : `Ouvrir · ${fmtChips(pack.price)}`}
                          </button>
                        ) : (
                          <Link to="/espace-membre" className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 sm:px-9 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.35)]">
                            Se connecter pour ouvrir
                          </Link>
                        )}
                        <button type="button" onClick={() => setOddsOpen(true)} className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm rounded-full px-6 py-4 flex items-center gap-2 transition-all">
                          <Info size={15} /> Taux &amp; cartes
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {stage === 'opening' && openingPack && (
              <motion.div key="opening" className="absolute inset-0 flex flex-col items-center justify-center px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <div className="relative" style={{ width: packW * 1.15, height: packW * 1.62 * 1.15 }}>
                  {/* Cartes qui sortent du paquet */}
                  <AnimatePresence>
                    {cardsOut && (
                      <motion.div
                        className="absolute left-1/2 top-[14%] z-0"
                        style={{ marginLeft: -(packW * 0.9) / 2 }}
                        initial={{ y: packW * 0.8, opacity: 0 }}
                        animate={{ y: -packW * 0.75, opacity: 1 }}
                        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
                      >
                        {Array.from({ length: Math.min(3, openingPack.cards_per_pack) }).map((_, i) => (
                          <div key={i} className="absolute" style={{ top: i * -4, left: i * 3 }}>
                            <BoosterCardBack width={packW * 0.9} interactive={false} />
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Lueur quand le paquet s'ouvre */}
                  {torn && <div className="absolute inset-x-0 top-0 h-1/3 z-0 blur-3xl rounded-full" style={{ background: rgba(openingPack.accent_color || '#ffffff', 0.55) }} />}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center z-10"
                    initial={{ scale: 0.85, y: 40 }}
                    animate={cardsOut ? { y: vh * 0.75, rotate: 6, scale: 1.15, opacity: [1, 1, 0] } : { scale: 1.15, y: 0 }}
                    transition={cardsOut ? { duration: 0.85, delay: 0.45, ease: 'easeIn', opacity: { duration: 0.85, delay: 0.45, times: [0, 0.75, 1] } } : { type: 'spring', stiffness: 140, damping: 16 }}
                  >
                    <div className={!torn ? 'bst-shake' : ''} style={{ animationDuration: '2.4s' }}>
                      <BoosterPack pack={openingPack} width={packW} tearable autoTear={autoTear} onTorn={onTorn} />
                    </div>
                  </motion.div>
                </div>
                <div className="h-20 mt-8 flex flex-col items-center gap-3">
                  {!torn ? (
                    <>
                      <p className="text-white/80 text-sm flex items-center gap-2">
                        <motion.span animate={{ x: [-14, 14, -14] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                          ↔
                        </motion.span>
                        Glissez le long du haut du paquet pour le déchirer
                      </p>
                      <button type="button" onClick={() => setAutoTear(true)} className="text-xs text-white/60 hover:text-white underline underline-offset-4">
                        ou cliquez ici pour l'ouvrir
                      </button>
                    </>
                  ) : !result ? (
                    <p className="text-white/60 text-sm flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Tirage en cours…
                    </p>
                  ) : null}
                </div>
              </motion.div>
            )}

            {stage === 'reveal' && drawn.length > 0 && (
              <motion.div key="reveal" className="absolute inset-0 flex flex-col items-center justify-center px-4 pt-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50 mb-4">
                  Carte {current + 1} / {drawn.length}
                </p>
                <div className="relative" style={{ width: cardW, height: cardW * 1.4 }} onClick={advance} role="button" tabIndex={0} aria-label={flipped ? 'Carte suivante' : 'Retourner la carte'}>
                  {/* Pile restante */}
                  {drawn.slice(current + 1).map((_, i, rest) => (
                    <div key={i} className="absolute inset-0" style={{ transform: `translate(${(rest.length - i) * 3}px, ${(rest.length - i) * -3}px)`, zIndex: 0 }}>
                      <BoosterCardBack width={cardW} interactive={false} />
                    </div>
                  ))}
                  <AnimatePresence mode="popLayout">
                    <RevealCard
                      key={current}
                      card={drawn[current]}
                      width={cardW}
                      flipped={flipped}
                      charging={charging}
                      effectKey={effectKey}
                    />
                  </AnimatePresence>
                </div>
                <div className="h-20 mt-6 flex flex-col items-center justify-start text-center">
                  <AnimatePresence mode="wait">
                    {flipped ? (
                      <motion.div key={`l${current}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
                        <div className="text-2xl sm:text-3xl font-bold uppercase tracking-wide" style={{ color: drawn[current].color, textShadow: `0 0 24px ${rgba(drawn[current].color, 0.7)}`, fontFamily: 'var(--font-tight)' }}>
                          {drawn[current].rarity.label}
                        </div>
                        <div className="text-xs text-white/50 mt-1">Touchez pour continuer</div>
                      </motion.div>
                    ) : (
                      <motion.p key={`h${current}`} className="text-sm text-white/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {charging ? '…' : 'Touchez la carte pour la retourner'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {stage === 'summary' && result && summary && (
              <motion.div key="summary" className="absolute inset-0 overflow-y-auto pt-[92px] sm:pt-[104px] pb-10 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <div className="max-w-6xl mx-auto flex flex-col items-center">
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-white/60">{openingPack?.name}</p>
                  <h2 className="mt-1 text-3xl sm:text-5xl text-white leading-none text-center" style={{ fontFamily: 'var(--font-serif)' }}>
                    Votre <span className="italic text-white/70">tirage</span>
                  </h2>
                  <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                    <span className="rounded-full liquid-glass border border-white/20 px-4 py-2 text-white">
                      Valeur totale <b className="font-mono ml-1">{fmtMoney(summary.total)}</b>
                    </span>
                    <span className="rounded-full liquid-glass border border-white/20 px-4 py-2 text-white/80">
                      Payé <b className="font-mono ml-1">{fmtChips(summary.price)}</b>
                    </span>
                  </div>
                  <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
                    {drawn.map((c, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 30, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 160, damping: 18 }}>
                        <BoosterCardFace card={c} width={vw < 640 ? Math.min(160, (vw - 48) / 2) : 190} />
                      </motion.div>
                    ))}
                  </div>
                  <p className="mt-6 text-xs text-white/50 text-center max-w-md ">
                    {sold !== null
                      ? `Véhicules revendus : +${sold.toLocaleString('fr-FR')} jetons crédités.`
                      : `Les véhicules sont dans votre inventaire : revendez-les${sellRate > 0 ? ` (${sellRate} % de leur valeur)` : ''} ou réclamez-les pour les recevoir en ville.`}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    {openingPack && (
                      <button
                        type="button"
                        onClick={() => {
                          const i = packs.findIndex((p) => p.id === openingPack.id);
                          if (i >= 0) setIndex(i);
                          void buy(openingPack);
                        }}
                        disabled={closed || balance < (openingPack?.price ?? 0)}
                        className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                      >
                        Ouvrir un autre · {fmtChips(openingPack.price)}
                      </button>
                    )}
                    <button type="button" onClick={backToSelect} className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm rounded-full px-6 py-4">
                      Changer de booster
                    </button>
                    {sellRate > 0 && sold === null && (
                      <button
                        type="button"
                        disabled={selling}
                        onClick={async () => {
                          const ids = result.cards.map((c) => c.reward_id).filter((x): x is string => !!x);
                          setSelling(true);
                          try {
                            const res = await apiSellRewards(ids);
                            applyServerProfile(res.profile);
                            setSold(res.chips);
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setSelling(false);
                          }
                        }}
                        className="liquid-glass border border-amber-300/40 hover:bg-amber-300/10 text-amber-100 font-semibold text-xs sm:text-sm rounded-full px-6 py-4 disabled:opacity-50"
                      >
                        {selling ? 'Revente…' : `Tout revendre · ${fmtChips(Math.floor((summary.total * sellRate) / 100))}`}
                      </button>
                    )}
                    <Link to="/espace-membre" hash="inventaire" className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm rounded-full px-6 py-4">
                      Mon inventaire
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Flash plein écran */}
        <AnimatePresence>
          {flash && (
            <motion.div className="absolute inset-0 z-50 pointer-events-none" style={{ background: flash }} initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />
          )}
        </AnimatePresence>

        {oddsOpen && pack && (
          <OddsModal pack={pack} catalog={catalog!} cardsById={cardsById} onClose={() => setOddsOpen(false)} />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Carte en cours de révélation
// ---------------------------------------------------------------------------

const RevealCard = React.forwardRef<
  HTMLDivElement,
  { card: ResolvedCard; width: number; flipped: boolean; charging: boolean; effectKey: number }
>(({ card, width, flipped, charging, effectKey }, ref) => {
  const tier = rarityTier(card.rarity);
  return (
    <motion.div
      ref={ref}
      className="absolute inset-0 z-10 cursor-pointer"
      style={{ perspective: 1200 }}
      initial={{ scale: 0.9, y: 20, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ x: -width * 1.6, y: 60, rotate: -24, opacity: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.8, 0.6] } }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      {/* Rayons derrière la carte (légendaire et plus) */}
      {flipped && tier >= 3 && (
        <motion.div
          key={`rays${effectKey}`}
          className="absolute left-1/2 top-1/2 bst-rays pointer-events-none"
          style={{ width: width * 3.2, height: width * 3.2, marginLeft: -width * 1.6, marginTop: -width * 1.6, ['--bst-ray' as string]: rgba(card.color, 0.4) }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {flipped && tier >= 1 && (
        <motion.div
          key={`halo${effectKey}`}
          className="absolute inset-[-18%] rounded-full blur-3xl pointer-events-none"
          style={{ background: rgba(card.color, 0.35 + tier * 0.08) }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.7] }}
          transition={{ duration: 1.2 }}
        />
      )}

      <motion.div
        className={`relative w-full h-full ${charging ? 'bst-shake' : ''}`}
        style={{ transformStyle: 'preserve-3d', animationDuration: charging && tier >= 4 ? '0.15s' : '0.3s' }}
        initial={false}
        animate={{ rotateY: flipped ? 0 : 180, scale: charging ? 1.05 : 1 }}
        transition={{ duration: tier >= 3 ? 0.75 : 0.55, ease: [0.3, 0.9, 0.35, 1] }}
      >
        {/* Face */}
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          <BoosterCardFace card={card} width={width} />
        </div>
        {/* Dos */}
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <BoosterCardBack width={width} hint={tier >= 1 ? card.color : null} />
        </div>
      </motion.div>

      {flipped && tier >= 2 && <Burst key={`b${effectKey}`} color={card.color} count={tier >= 4 ? 70 : tier >= 3 ? 46 : 26} spread={width * (tier >= 3 ? 1.5 : 1.1)} />}
    </motion.div>
  );
});
RevealCard.displayName = 'RevealCard';

// ---------------------------------------------------------------------------
// Taux & cartes
// ---------------------------------------------------------------------------

const OddsModal: React.FC<{ pack: BoosterPackData; catalog: BoosterCatalog; cardsById: Record<string, BoosterCardData>; onClose: () => void }> = ({ pack, catalog, cardsById, onClose }) => {
  const rarities = rarityMap(catalog.rarities);
  const odds = packOdds(pack, cardsById, catalog.rarities);
  const cards = pack.cards
    .map((pc) => cardsById[pc.card_id])
    .filter(Boolean)
    .map((c) => resolveCard(c, rarities))
    .sort((a, b) => b.rarity.sort - a.rarity.sort || b.value - a.value);
  const paged = useIncremental(cards, 30, pack.id);

  return (
    <div className="absolute inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-full overflow-y-auto rounded-2xl bg-neutral-950/95 border border-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-neutral-950 flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="text-white font-bold">{pack.name}</h3>
            <p className="text-xs text-white/50">
              {pack.cards_per_pack} carte(s) par booster · {cards.length} cartes possibles
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/50 mb-2">Chances par carte</p>
            <div className="flex flex-col gap-2">
              {odds.map((o) => (
                <div key={o.rarity.key} className="grid grid-cols-[110px_1fr_64px] items-center gap-3 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold" style={{ color: o.rarity.color }}>
                    <Gem size={13} /> {o.rarity.label}
                  </span>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(1, o.pct)}%`, background: o.rarity.color }} />
                  </div>
                  <span className="text-right font-mono text-white">{o.pct.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %</span>
                </div>
              ))}
            </div>
            {pack.guaranteed_rarity && rarities[pack.guaranteed_rarity] && (
              <p className="text-xs text-white/50 mt-3">
                Garantie : au moins une carte {rarities[pack.guaranteed_rarity].label} ou mieux par booster (appliquée sur la dernière carte si besoin).
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/50 mb-3">Cartes possibles</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 justify-items-center">
              {paged.visible.map((c, i) => (
                <BoosterCardFace key={i} card={c} width={150} lite />
              ))}
            </div>
        {paged.hasMore && (
          <div ref={paged.sentinelRef} className="py-6 text-center text-xs text-neutral-500">
            Chargement de {Math.min(40, paged.remaining)} carte(s) de plus… ({paged.remaining} restante(s))
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoostersGame;
