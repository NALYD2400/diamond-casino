/**
 * Caisse du casino et jackpot, vus par les joueurs : gain max d'une manche
 * (part de la caisse autorisée par le serveur) et montant du jackpot progressif.
 *
 * Une seule lecture partagée par tous les composants, rafraîchie toutes les
 * 30 s tant qu'un jeu est affiché, et après chaque manche (refreshCasinoLimits).
 * Purement informatif : le serveur applique lui-même ces plafonds.
 */
import { useSyncExternalStore } from 'react';
import { apiCasinoLimits, type CasinoLimits } from './supabase';

const POLL_MS = 30_000;

let current: CasinoLimits | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let lastFetch = 0;
/** Entre deux manches rapprochées, une seule lecture toutes les 4 s */
const MIN_GAP_MS = 4_000;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function refreshCasinoLimits(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetch < MIN_GAP_MS) return Promise.resolve();
  lastFetch = Date.now();
  inFlight = apiCasinoLimits()
    .then((data) => {
      if (data) {
        current = data;
        emit();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Mise à jour immédiate après une manche (le serveur renvoie le nouveau gain max) */
export function setCasinoMaxWin(maxWin: number | undefined | null): void {
  if (current && typeof maxWin === 'number' && Number.isFinite(maxWin)) {
    current = { ...current, max_win: maxWin, open: maxWin > 0 };
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshCasinoLimits(true);
    timer = setInterval(() => void refreshCasinoLimits(true), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useCasinoLimits(): CasinoLimits | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Gain max d'une manche : réglage du jeu, plafonné par la caisse du casino */
export function useCappedMaxPayout(maxPayout: number): number {
  const limits = useCasinoLimits();
  const bank = limits?.max_win;
  return typeof bank === 'number' && bank >= 0 ? Math.min(maxPayout, bank) : maxPayout;
}

// -------------------------------------------------------------
// Annonce d'un jackpot remporté (affichée par JackpotWinOverlay)
// -------------------------------------------------------------

let jackpotWon: number | null = null;
const jackpotListeners = new Set<() => void>();

export function announceJackpot(amount: number): void {
  if (!(amount > 0)) return;
  jackpotWon = amount;
  jackpotListeners.forEach((l) => l());
  void refreshCasinoLimits(true);
}

export function dismissJackpot(): void {
  jackpotWon = null;
  jackpotListeners.forEach((l) => l());
}

export function useJackpotWon(): number | null {
  return useSyncExternalStore(
    (l) => {
      jackpotListeners.add(l);
      return () => jackpotListeners.delete(l);
    },
    () => jackpotWon,
    () => null,
  );
}
