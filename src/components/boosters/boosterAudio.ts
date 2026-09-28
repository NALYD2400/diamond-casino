import { SampleBank } from '../slots/sampleBank';

const BASE_URL = '/sounds/boosters/';

const SAMPLES = {
  tear1: 'tear-1.mp3',
  tear2: 'tear-2.mp3',
  takeOut1: 'take-out-1.mp3',
  takeOut2: 'take-out-2.mp3',
  flip1: 'flip-1.mp3',
  flip2: 'flip-2.mp3',
  flip3: 'flip-3.mp3',
  flip4: 'flip-4.mp3',
  slide1: 'slide-1.mp3',
  slide2: 'slide-2.mp3',
  slide3: 'slide-3.mp3',
  slide4: 'slide-4.mp3',
} as const;

type BoosterSample = keyof typeof SAMPLES;

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
/** Légère variation de hauteur pour éviter l'effet « même son répété » */
const vary = (spread = 0.05) => 1 + (Math.random() * 2 - 1) * spread;

/**
 * Sons des boosters : uniquement de vrais bruits de cartes (Kenney « Casino Audio »,
 * CC0) — ouverture du paquet, cartes qui sortent, retournement, glissement.
 * Pas de jingle ni de son synthétisé.
 */
export class BoosterAudio {
  private readonly bank = new SampleBank<BoosterSample>(BASE_URL, SAMPLES);

  get muted() {
    return this.bank.muted;
  }
  set muted(v: boolean) {
    this.bank.muted = v;
  }
  get volume() {
    return this.bank.volume;
  }
  set volume(v: number) {
    this.bank.volume = Math.max(0, Math.min(1, v));
  }

  /** À appeler sur un geste utilisateur (politique d'autoplay) */
  unlock() {
    this.bank.unlock();
  }

  /** Paquet ouvert */
  tear() {
    this.bank.play(pick(['tear1', 'tear2'] as const), 1, vary(0.03));
  }

  /** Cartes qui sortent du paquet */
  slide() {
    this.bank.play(pick(['takeOut1', 'takeOut2'] as const), 0.9);
  }

  /** Retournement d'une carte */
  flip() {
    this.bank.play(pick(['flip1', 'flip2', 'flip3', 'flip4'] as const), 0.85, vary());
  }

  /** Carte qui file sur le côté */
  swipe() {
    this.bank.play(pick(['slide1', 'slide2', 'slide3', 'slide4'] as const), 0.7, vary());
  }
}
