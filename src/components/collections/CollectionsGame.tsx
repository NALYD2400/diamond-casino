/**
 * COLLECTIONS — albums de cartes « marques » de GTA V (autos & mode).
 *
 * 1. Choix de l'album, progression, récompense à la clé (réglée par album)
 * 2. Achat d'un booster (ou ouverture d'un booster gagné à la roue)
 * 3. Ouverture : glisser le long du haut du paquet pour le déchirer
 * 4. Révélation carte par carte (NOUVELLE ! / doublon)
 * 5. Album : cartes possédées, manquantes, secrètes, revente des doublons
 *
 * Tout le tirage (et la récompense d'album) est fait par le serveur ; la page
 * ne fait que la mise en scène.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Gift, Info, Loader2, Sparkles, Trophy, X } from 'lucide-react';
import { useCasinoUser } from '../../context/CasinoUserContext';
import {
  apiCollectionCatalog,
  apiMyCollections,
  apiOpenCollectionPack,
  type CollectionCatalog,
  type CollectionSetData,
  type MyCollections,
  type OpenCollectionPackResult,
} from '../../lib/supabase';
import { FullscreenButton } from '../FullscreenButton';
import { GameVolumeButton } from '../VolumeControl';
import { MachineClosedBanner, useMachineClosed } from '../MachineClosedBanner';
import { BoosterCardBack } from '../boosters/BoosterCard';
import { BoosterPack } from '../boosters/BoosterPack';
import { BoosterAudio } from '../boosters/boosterAudio';
import { rgba } from '../boosters/boosterUtils';
import { BrandCardFace } from './BrandCard';
import { PackFan, packFanCards, packLookFor } from './PackFan';
import { readStoredSet, setIcon, storeSet } from './CollectionAlbum';
import { fmtChips, fmtPct, rarityMap, rarityTier, resolveBrandCard, setOdds, type BrandCard } from './collectionUtils';

type Stage = 'opening' | 'reveal' | 'summary';

const VOLUME_KEY = 'collections_volume';

function useViewport() {
  const [size, setSize] = useState(() => ({ w: typeof window === 'undefined' ? 1280 : window.innerWidth, h: typeof window === 'undefined' ? 800 : window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
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
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 3 + Math.random() * 6, delay: Math.random() * 0.12, white: Math.random() < 0.35, dur: 1.1 + Math.random() * 0.5 };
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
          transition={{ duration: p.dur, delay: p.delay, ease: [0.1, 0.8, 0.3, 1] }}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const CollectionsGame: React.FC = () => {
  const { user, isAuthenticated, applyServerProfile, refreshProfile } = useCasinoUser();
  const closedState = useMachineClosed('collections');
  const closed = closedState !== null;
  const calm = useReducedMotion();
  const { w: vw, h: vh } = useViewport();

  const [catalog, setCatalog] = useState<CollectionCatalog | null>(null);
  const [mine, setMine] = useState<MyCollections | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setId, setSetId] = useState<string>(readStoredSet);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ouverture
  const [stage, setStage] = useState<Stage | null>(null);
  const [result, setResult] = useState<OpenCollectionPackResult | null>(null);
  const [torn, setTorn] = useState(false);
  const [autoTear, setAutoTear] = useState(false);
  const [cardsOut, setCardsOut] = useState(false);
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
      const raw = localStorage.getItem(VOLUME_KEY);
      const v = Number(raw);
      return raw !== null && Number.isFinite(v) ? v : 0.8;
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
  useEffect(() => storeSet(setId), [setId]);

  const loadCatalog = useCallback(() => {
    apiCollectionCatalog()
      .then((c) => {
        setCatalog(c);
        setLoadError(null);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);
  const loadMine = useCallback(() => {
    if (!isAuthenticated) {
      setMine(null);
      return;
    }
    apiMyCollections()
      .then(setMine)
      .catch(() => {});
  }, [isAuthenticated]);
  useEffect(loadCatalog, [loadCatalog]);
  useEffect(loadMine, [loadMine]);

  const rarities = useMemo(() => rarityMap(catalog?.rarities ?? []), [catalog]);
  const sets = catalog?.sets ?? [];
  const setIndex = Math.max(0, sets.findIndex((s) => s.id === setId));
  const set: CollectionSetData | undefined = sets[setIndex];
  const pick = (i: number) => {
    if (!sets.length) return;
    setSetId(sets[(i + sets.length) % sets.length].id);
    setError(null);
  };
  const owned = useMemo(() => new Map((mine?.owned ?? []).map((o) => [o.card_id, o])), [mine]);
  const secretsFound = useMemo(() => new Map((mine?.secrets ?? []).map((c) => [c.id, c])), [mine]);

  /** Cartes de l'album courant (secrètes trouvées dévoilées) */
  const cards = useMemo(() => {
    if (!catalog || !set) return [] as BrandCard[];
    return catalog.cards
      .filter((c) => c.set_id === set.id)
      .map((c) => resolveBrandCard(secretsFound.get(c.id) ?? c, rarities))
      .sort((a, b) => Number(a.secret) - Number(b.secret) || a.number - b.number);
  }, [catalog, set, rarities, secretsFound]);
  const albumCards = cards.filter((c) => !c.secret);
  const setSize = albumCards.length;
  const ownedCount = albumCards.filter((c) => (owned.get(c.id)?.total_found ?? 0) > 0).length;
  const completion = mine?.completions.find((c) => c.set_id === set?.id);
  const gifts = (mine?.gifts ?? []).filter((g) => !g.set_id || g.set_id === set?.id || !sets.some((s) => s.id === g.set_id));

  const fanFor = useCallback((id: string) => (catalog ? packFanCards(catalog, id) : []), [catalog]);
  const fanCards = useMemo(() => (set ? fanFor(set.id) : []), [set, fanFor]);
  const lookFor = packLookFor;
  const packLook = set ? lookFor(set) : null;

  const balance = user?.chips ?? 0;
  const canAfford = !!set && balance >= set.pack_price;
  // Limite d'achat du jour (les boosters offerts n'y sont pas soumis)
  const dailyLimit = catalog?.config.dailyPackLimit ?? 0;
  const boughtToday = (set && mine?.bought_today?.[set.id]) || 0;
  const limitReached = dailyLimit > 0 && boughtToday >= dailyLimit;
  const drawn = useMemo(() => (result ? result.cards.map((c) => ({ card: resolveBrandCard(c, rarities), isNew: c.is_new, count: c.count })) : []), [result, rarities]);

  // Dimensions
  const packW = Math.round(Math.max(170, Math.min(250, (vh - 300) / 1.62, vw - 120)));
  const cardW = Math.round(Math.max(190, Math.min(290, (vh - 260) / 1.4, vw - 70)));
  const homePackW = Math.round(Math.max(140, Math.min(240, (vh - 600) / 1.62, vw < 640 ? vw * 0.5 : 240)));

  // ------------------------------------------------------------------ actions

  const open = async (giftId?: string) => {
    if (!set || busy.current || !isAuthenticated) return;
    audio.current!.unlock();
    setError(null);
    busy.current = true;
    setResult(null);
    setTorn(false);
    setAutoTear(false);
    setCardsOut(false);
    setCurrent(0);
    setFlipped(false);
    setStage('opening');
    try {
      const res = await apiOpenCollectionPack(set.id, giftId);
      applyServerProfile(res.profile);
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
      setStage(null);
      loadCatalog();
      loadMine();
    } finally {
      busy.current = false;
    }
  };

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

  const finish = useCallback(() => {
    setStage('summary');
    loadMine();
    void refreshProfile().catch(() => {});
  }, [loadMine, refreshProfile]);

  const advance = useCallback(() => {
    if (stage !== 'reveal' || charging || !drawn.length) return;
    const { card } = drawn[current];
    if (!flipped) {
      const tier = rarityTier(card.rarity);
      const doFlip = () => {
        setCharging(false);
        setFlipped(true);
        setEffectKey((k) => k + 1);
        audio.current!.flip();
        if (tier >= 3 && !calm) {
          setFlash(tier >= 4 ? card.rarity.color : '#ffffff');
          setShake(true);
          window.setTimeout(() => setFlash(null), 450);
          window.setTimeout(() => setShake(false), 500);
        }
      };
      if (tier >= 3) {
        setCharging(true);
        window.setTimeout(doFlip, tier >= 4 ? 1700 : 1000);
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

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      if ((e.target as HTMLElement)?.closest('input, textarea, select, button')) return;
      if (!stage) return;
      e.preventDefault();
      if (stage === 'reveal') advance();
      else if (stage === 'opening' && !torn) setAutoTear(true);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [stage, advance, torn]);

  // Pas de défilement de la page pendant l'ouverture
  useEffect(() => {
    if (!stage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stage]);

  const close = () => {
    setStage(null);
    setResult(null);
  };

  // ------------------------------------------------------------------ rendu

  const pct = setSize ? (ownedCount / setSize) * 100 : 0;
  const accent = set?.accent_color ?? '#d9b25f';

  return (
    <div data-fullscreen-root className="relative min-h-screen bg-black pt-[80px] sm:pt-[90px] pb-16 [&:fullscreen]:overflow-y-auto">
      <MachineClosedBanner state={closedState} demo={false} />

      {/* Fond */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video src="/hero_diamants.mp4" className="w-full h-full object-cover opacity-40" autoPlay loop muted playsInline />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 0%, ${rgba(accent, 0.22)}, rgba(0,0,0,0.85) 55%, #000 100%)` }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* Barre du haut */}
        <div className="flex items-center justify-between gap-2 pt-6 sm:pt-8">
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
          <div className="rounded-full bg-black/80 border border-white/20 shadow-lg backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white font-mono">
            {isAuthenticated ? fmtChips(balance) : 'Non connecté'}
          </div>
        </div>

        {/* Titre */}
        <div className="text-center mt-6 sm:mt-8">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-white/60">The Diamond Casino · Cartes à collectionner</p>
          <h1 className="mt-1 text-4xl sm:text-6xl text-white leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
            Collections <span className="italic text-white/70">de marques</span>
          </h1>
        </div>

        {!catalog && !loadError && (
          <div className="py-24 flex items-center justify-center text-white/60 text-sm gap-2">
            <Loader2 className="animate-spin" size={16} /> Chargement des collections…
          </div>
        )}
        {loadError && <div className="py-24 text-center text-rose-300 text-sm">{loadError}</div>}
        {catalog && sets.length === 0 && <div className="py-24 text-center text-white/60 text-sm">Aucune collection disponible pour le moment.</div>}

        {set && packLook && (
          <div className="flex flex-col items-center">
            {/* Carrousel des boosters (un par album) */}
            <div className="relative w-full flex items-center justify-center mt-4" style={{ height: homePackW * 1.62 + 40 }}>
              {sets.length > 1 && (
                <button
                  type="button"
                  onClick={() => pick(setIndex - 1)}
                  className="!absolute left-0 sm:left-[12%] z-20 w-11 h-11 rounded-full liquid-glass border border-white/20 text-white flex items-center justify-center hover:bg-white/10"
                  aria-label="Booster précédent"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="relative flex items-center justify-center" style={{ height: homePackW * 1.62 }}>
                {sets.map((s, i) => {
                  const off = i - setIndex;
                  const wrapped = Math.abs(off) > sets.length / 2 ? off - Math.sign(off) * sets.length : off;
                  if (Math.abs(wrapped) > 2) return null;
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      onClick={() => (wrapped === 0 ? undefined : pick(i))}
                      className="absolute"
                      style={{ zIndex: 10 - Math.abs(wrapped), cursor: wrapped === 0 ? 'default' : 'pointer' }}
                      animate={{
                        x: wrapped * homePackW * (vw < 640 ? 0.6 : 0.95),
                        scale: wrapped === 0 ? 1 : 0.72,
                        opacity: wrapped === 0 ? 1 : 0.5,
                        filter: wrapped === 0 ? 'brightness(1)' : 'brightness(0.55)',
                      }}
                      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                    >
                      <div className={wrapped === 0 ? 'bst-float' : ''}>
                        <BoosterPack
                          pack={{ ...lookFor(s), cover: <PackFan cards={fanFor(s.id)} width={homePackW} setName={s.name} /> }}
                          width={homePackW}
                          idle={wrapped === 0}
                          interactive={wrapped === 0}
                          baseRotateY={wrapped * -28}
                        />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {sets.length > 1 && (
                <button
                  type="button"
                  onClick={() => pick(setIndex + 1)}
                  className="!absolute right-0 sm:right-[12%] z-20 w-11 h-11 rounded-full liquid-glass border border-white/20 text-white flex items-center justify-center hover:bg-white/10"
                  aria-label="Booster suivant"
                >
                  <ChevronRight size={20} />
                </button>
              )}
            </div>

            {/* Infos du booster sélectionné */}
            <div className="w-full max-w-lg flex flex-col items-center text-center gap-3 mt-6">
              <div>
                <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.25em] font-semibold" style={{ color: accent }}>
                  {setIcon(set.id, 13)} {set.subtitle || 'Album'}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">{set.name}</h2>
                {set.description && <p className="text-xs sm:text-sm text-white/60 mt-1">{set.description}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/80">
                <span className="rounded-full bg-white/10 border border-white/15 px-2.5 py-1">{set.cards_per_pack} cartes</span>
                <span className="rounded-full px-2.5 py-1 flex items-center gap-1 border" style={{ color: accent, borderColor: rgba(accent, 0.4), background: rgba(accent, 0.12) }}>
                  <Trophy size={12} /> Album complet : {fmtChips(set.reward)}
                </span>
                {isAuthenticated && (
                  <span className={`rounded-full border px-2.5 py-1 ${completion ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' : 'bg-white/10 border-white/15'}`}>
                    {completion ? 'Album complété ✓' : `Mon album : ${ownedCount} / ${setSize}`}
                  </span>
                )}
              </div>
              {isAuthenticated && !completion && (
                <div className="w-full max-w-xs h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: accent }} />
                </div>
              )}
              {error && <p className="text-sm text-rose-300">{error}</p>}
              {isAuthenticated && dailyLimit > 0 && (
                <p className={`text-xs ${limitReached ? 'text-amber-200' : 'text-neutral-400'}`}>
                  Boosters achetés aujourd'hui : {Math.min(boughtToday, dailyLimit)} / {dailyLimit}
                  {limitReached ? ' — revenez demain' : ''}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => void open()}
                    disabled={closed || !canAfford || limitReached}
                    className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 sm:px-9 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.35)] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
                  >
                    {closed ? 'Collections fermées' : limitReached ? 'Limite du jour atteinte' : !canAfford ? `Solde insuffisant · ${fmtChips(set.pack_price)}` : `Ouvrir · ${fmtChips(set.pack_price)}`}
                  </button>
                ) : (
                  <Link to="/espace-membre" className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 sm:px-9 py-4 shadow-[0_0_30px_rgba(255,255,255,0.35)]">
                    Se connecter pour ouvrir
                  </Link>
                )}
                {gifts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void open(gifts[0].id)}
                    disabled={closed}
                    className="flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-300/10 hover:bg-amber-300/20 text-amber-100 font-bold text-xs sm:text-sm uppercase tracking-wider px-6 py-4 disabled:opacity-40"
                  >
                    <Gift size={16} /> Offert ({gifts.length})
                  </button>
                )}
                <button type="button" onClick={() => setOddsOpen(true)} className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm rounded-full px-6 py-4 flex items-center gap-2">
                  <Info size={15} /> Taux &amp; cartes
                </button>
              </div>
              {isAuthenticated && (
                <Link to="/espace-membre" hash="collections" className="flex items-center gap-2 text-xs text-white/60 hover:text-white underline underline-offset-4 mt-1">
                  <BookOpen size={13} /> Mon album et mes doublons (Espace Membre)
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ouverture plein écran */}
      <AnimatePresence>
        {stage && set && packLook && (
          <motion.div key="overlay" className="fixed inset-0 z-[70] bg-black/92 backdrop-blur-sm overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute top-5 right-4 sm:right-6 z-40 flex items-center gap-2">
              {stage === 'reveal' && (
                <button type="button" onClick={finish} className="rounded-full liquid-glass border border-white/20 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-semibold text-white">
                  Tout révéler
                </button>
              )}
              <FullscreenButton />
            </div>
            <motion.div className="absolute inset-0" animate={shake ? { x: [0, -8, 7, -5, 4, 0], y: [0, 4, -5, 3, -2, 0] } : { x: 0, y: 0 }} transition={{ duration: 0.45 }}>
              <AnimatePresence mode="wait">
                {stage === 'opening' && (
                  <motion.div key="opening" className="absolute inset-0 flex flex-col items-center justify-center px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="relative" style={{ width: packW * 1.15, height: packW * 1.62 * 1.15 }}>
                      <AnimatePresence>
                        {cardsOut && (
                          <motion.div
                            className="absolute left-1/2 top-[14%] z-0"
                            style={{ marginLeft: -(packW * 0.9) / 2 }}
                            initial={{ y: packW * 0.8, opacity: 0 }}
                            animate={{ y: -packW * 0.75, opacity: 1 }}
                            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
                          >
                            {[0, 1, 2].map((i) => (
                              <div key={i} className="absolute" style={{ top: i * -4, left: i * 3 }}>
                                <BoosterCardBack width={packW * 0.9} interactive={false} caption="Collection de marques" />
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {torn && <div className="absolute inset-x-0 top-0 h-1/3 z-0 blur-3xl rounded-full" style={{ background: rgba(accent, 0.55) }} />}
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center z-10"
                        initial={{ scale: 0.85, y: 40 }}
                        animate={cardsOut ? { y: vh * 0.75, rotate: 6, scale: 1.15, opacity: [1, 1, 0] } : { scale: 1.15, y: 0 }}
                        transition={cardsOut ? { duration: 0.85, delay: 0.45, ease: 'easeIn', opacity: { duration: 0.85, delay: 0.45, times: [0, 0.75, 1] } } : { type: 'spring', stiffness: 140, damping: 16 }}
                      >
                        <div className={!torn ? 'bst-shake' : ''} style={{ animationDuration: '2.4s' }}>
                          <BoosterPack
                            pack={{ ...packLook, cover: <PackFan cards={fanCards} width={packW} setName={set.name} /> }}
                            width={packW}
                            tearable
                            autoTear={autoTear}
                            onTorn={() => {
                              setTorn(true);
                              audio.current!.tear();
                            }}
                          />
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
                  <motion.div key="reveal" className="absolute inset-0 flex flex-col items-center justify-center px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/50 mb-4">
                      Carte {current + 1} / {drawn.length}
                    </p>
                    <div className="relative" style={{ width: cardW, height: cardW * 1.4 }} onClick={advance} role="button" tabIndex={0} aria-label={flipped ? 'Carte suivante' : 'Retourner la carte'}>
                      {drawn.slice(current + 1).map((_, i, rest) => (
                        <div key={i} className="absolute inset-0" style={{ transform: `translate(${(rest.length - i) * 3}px, ${(rest.length - i) * -3}px)` }}>
                          <BoosterCardBack width={cardW} interactive={false} caption="Collection de marques" />
                        </div>
                      ))}
                      <AnimatePresence mode="popLayout">
                        <RevealCard key={current} card={drawn[current].card} width={cardW} flipped={flipped} charging={charging} effectKey={effectKey} setName={set.name} setSize={setSize} />
                      </AnimatePresence>
                    </div>
                    <div className="h-20 mt-6 flex flex-col items-center justify-start text-center">
                      <AnimatePresence mode="wait">
                        {flipped ? (
                          <motion.div key={`l${current}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-2xl sm:text-3xl font-bold uppercase tracking-wide" style={{ color: drawn[current].card.rarity.color, textShadow: `0 0 24px ${rgba(drawn[current].card.rarity.color, 0.7)}`, fontFamily: 'var(--font-tight)' }}>
                                {drawn[current].card.rarity.label}
                              </span>
                              {drawn[current].isNew ? (
                                <span className="rounded-full bg-emerald-400 text-black text-[11px] font-extrabold px-2.5 py-1 uppercase">Nouvelle !</span>
                              ) : (
                                <span className="rounded-full bg-white/15 text-white text-[11px] font-bold px-2.5 py-1 uppercase">Doublon · ×{drawn[current].count}</span>
                              )}
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

                {stage === 'summary' && result && (
                  <motion.div key="summary" className="absolute inset-0 overflow-y-auto pt-16 pb-10 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="max-w-5xl mx-auto flex flex-col items-center">
                      {result.completed ? (
                        <motion.div className="relative text-center mb-8" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 12 }}>
                          <div className="absolute left-1/2 top-1/2 w-[520px] h-[520px] -ml-[260px] -mt-[260px] bst-rays pointer-events-none opacity-80" style={{ ['--bst-ray' as string]: rgba('#fbbf24', 0.3) }} />
                          <Burst color="#fbbf24" count={80} spread={320} />
                          <Trophy size={54} className="mx-auto text-amber-300 drop-shadow-[0_0_24px_rgba(251,191,36,0.8)]" />
                          <p className="relative mt-2 text-xs uppercase tracking-[0.35em] text-amber-200">Collection complète</p>
                          <h2 className="relative text-4xl sm:text-6xl text-white leading-none mt-1" style={{ fontFamily: 'var(--font-serif)' }}>
                            {set.name}
                          </h2>
                          <p className="relative mt-3 text-3xl sm:text-4xl font-bold font-mono text-amber-300">+{fmtChips(result.reward)}</p>
                        </motion.div>
                      ) : (
                        <>
                          <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-white/60">{set.name}</p>
                          <h2 className="mt-1 text-3xl sm:text-5xl text-white leading-none text-center" style={{ fontFamily: 'var(--font-serif)' }}>
                            Votre <span className="italic text-white/70">tirage</span>
                          </h2>
                        </>
                      )}
                      <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
                        <span className="rounded-full liquid-glass border border-white/20 px-4 py-2 text-white">
                          Nouvelles cartes <b className="font-mono ml-1">{drawn.filter((d) => d.isNew).length}</b>
                        </span>
                        <span className="rounded-full liquid-glass border border-white/20 px-4 py-2 text-white/80">
                          Album <b className="font-mono ml-1">{ownedCount} / {setSize}</b>
                        </span>
                        <span className="rounded-full liquid-glass border border-white/20 px-4 py-2 text-white/80">{result.gift ? 'Booster offert' : `Payé ${fmtChips(result.price)}`}</span>
                      </div>
                      <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
                        {drawn.map((d, i) => (
                          <motion.div key={i} className="relative" initial={{ opacity: 0, y: 30, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 160, damping: 18 }}>
                            <BrandCardFace card={d.card} width={vw < 640 ? Math.min(160, (vw - 48) / 2) : 180} setName={set.name} setSize={setSize} />
                            <span className={`absolute -top-2 -right-2 z-10 rounded-full text-[10px] font-extrabold px-2 py-1 uppercase shadow-lg ${d.isNew ? 'bg-emerald-400 text-black' : 'bg-neutral-800 text-white border border-white/20'}`}>
                              {d.isNew ? 'Nouvelle' : `×${d.count}`}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                      <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => void open()}
                          disabled={closed || balance < set.pack_price || limitReached}
                          className="bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm tracking-wider uppercase rounded-full px-7 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                          {limitReached ? 'Limite du jour atteinte' : `Encore un · ${fmtChips(set.pack_price)}`}
                        </button>
                        {gifts.length > 0 && (
                          <button type="button" onClick={() => void open(gifts[0].id)} disabled={closed} className="flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-300/10 hover:bg-amber-300/20 text-amber-100 font-bold text-xs sm:text-sm uppercase px-6 py-4 disabled:opacity-40">
                            <Gift size={15} /> Booster offert ({gifts.length})
                          </button>
                        )}
                        <button type="button" onClick={close} className="liquid-glass border border-white/20 hover:bg-white/10 text-white font-semibold text-xs sm:text-sm rounded-full px-6 py-4">
                          Voir l'album
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <AnimatePresence>
              {flash && <motion.div className="absolute inset-0 z-50 pointer-events-none" style={{ background: flash }} initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {oddsOpen && set && catalog && <OddsModal set={set} catalog={catalog} onClose={() => setOddsOpen(false)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Carte en cours de révélation
// ---------------------------------------------------------------------------

const RevealCard = React.forwardRef<
  HTMLDivElement,
  { card: BrandCard; width: number; flipped: boolean; charging: boolean; effectKey: number; setName: string; setSize: number }
>(({ card, width, flipped, charging, effectKey, setName, setSize }, ref) => {
  const tier = rarityTier(card.rarity);
  const c = card.rarity.color;
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
      {flipped && tier >= 3 && (
        <motion.div
          key={`rays${effectKey}`}
          className="absolute left-1/2 top-1/2 bst-rays pointer-events-none"
          style={{ width: width * 3.2, height: width * 3.2, marginLeft: -width * 1.6, marginTop: -width * 1.6, ['--bst-ray' as string]: rgba(c, 0.4) }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {flipped && tier >= 1 && (
        <motion.div
          key={`halo${effectKey}`}
          className="absolute inset-[-18%] rounded-full blur-3xl pointer-events-none"
          style={{ background: rgba(c, 0.35 + tier * 0.08) }}
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
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          <BrandCardFace card={card} width={width} setName={setName} setSize={setSize} />
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <BoosterCardBack width={width} hint={tier >= 1 ? c : null} caption="Collection de marques" />
        </div>
      </motion.div>
      {flipped && tier >= 2 && <Burst key={`b${effectKey}`} color={c} count={tier >= 4 ? 70 : tier >= 3 ? 46 : 26} spread={width * (tier >= 3 ? 1.5 : 1.1)} />}
    </motion.div>
  );
});
RevealCard.displayName = 'RevealCard';

// ---------------------------------------------------------------------------
// Taux & prix de revente
// ---------------------------------------------------------------------------

const OddsModal: React.FC<{ set: CollectionSetData; catalog: CollectionCatalog; onClose: () => void }> = ({ set, catalog, onClose }) => {
  const odds = setOdds(set, catalog.cards, catalog.rarities);
  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-xl max-h-full overflow-y-auto rounded-2xl bg-neutral-950/95 border border-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-neutral-950 flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="text-white font-bold">{set.name}</h3>
            <p className="text-xs text-white/50">
              {set.cards_per_pack} cartes par booster · {fmtChips(set.pack_price)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2.5 items-center text-sm">
            <span className="text-[11px] uppercase tracking-wider text-white/40">Rareté</span>
            <span className="text-[11px] uppercase tracking-wider text-white/40 text-right">Cartes</span>
            <span className="text-[11px] uppercase tracking-wider text-white/40 text-right">Chance / carte</span>
            <span className="text-[11px] uppercase tracking-wider text-white/40 text-right">Revente</span>
            {odds.map((o) => (
              <React.Fragment key={o.rarity.key}>
                <span className="font-semibold flex items-center gap-1.5" style={{ color: o.rarity.color }}>
                  {!o.rarity.in_collection && <Sparkles size={13} />} {o.rarity.label}
                </span>
                <span className="text-right font-mono text-white/70">{o.count}</span>
                <span className="text-right font-mono text-white">{fmtPct(o.pct)}</span>
                <span className="text-right font-mono text-amber-200">{fmtChips(Math.floor((o.rarity.sell_value * catalog.config.sellRate) / 100))}</span>
              </React.Fragment>
            ))}
          </div>
          <ul className="mt-5 text-xs text-white/55 space-y-1.5 list-disc pl-4">
            <li>Chaque carte d'un booster est tirée indépendamment par le serveur, avec les chances ci-dessus.</li>
            <li>Compléter l'album (toutes les cartes hors secrètes) rapporte {fmtChips(set.reward)}, une seule fois par joueur, crédités automatiquement.</li>
            <li>
              Seuls les doublons se revendent : le premier exemplaire de chaque carte reste dans l'album. Revente à {catalog.config.sellRate} % de la
              valeur de la carte, {catalog.config.sellRate + catalog.config.sellBonusGold} % avec la carte Gold et{' '}
              {catalog.config.sellRate + catalog.config.sellBonusDiamond} % avec la carte Diamond.
            </li>
            <li>Les cartes secrètes sont en plus de l'album : pas nécessaires pour la récompense, mais c'est le jackpot si vous en tirez une.</li>
            <li>Des boosters offerts peuvent aussi se gagner à la Roue de la Fortune.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CollectionsGame;
