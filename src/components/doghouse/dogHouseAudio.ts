import { SlotsAudio } from '../slots/slotsAudio';
import { SampleBank } from '../slots/sampleBank';

/**
 * Audio complet The Dog House fidèle à la version originale Pragmatic Play sur Stake :
 * - Échantillons CC0 (aboiements, pièces, fanfares, big win, fin de bonus)
 * - Sons procéduraux Web Audio : clacs de rouleaux, bruits d'anticipation montante,
 *   claquement lourd « slam » de Wild collant, carillon multiplicateur BOOST,
 *   roulette de barils 3x3 pour le tirage des tours gratuits,
 *   et bande-son cartoon ragtime/banjo entraînante pendant les Tours Gratuits.
 */

const BASE_URL = '/sounds/doghouse/';

const SAMPLES = {
  bark1: 'bark-1.mp3',
  bark2: 'bark-2.mp3',
  barkDouble: 'bark-double.mp3',
  winSmall: 'win-small.mp3',
  winMedium: 'win-medium.mp3',
  winBig: 'win-big.mp3',
  bonusTrigger: 'bonus-trigger.mp3',
  bonusEnd: 'bonus-end.mp3',
  coin1: 'coin-1.mp3',
  coin2: 'coin-2.mp3',
  coin3: 'coin-3.mp3',
  coinsShower: 'coins-shower.mp3',
  switch: 'switch.mp3',
  slam: 'slam.mp3',
  reelSpin: 'reel-spin.mp3',
  reelTick: 'reel-tick.mp3',
} as const;

type SampleName = keyof typeof SAMPLES;

export class DogHouseAudio {
  readonly synth = new SlotsAudio();
  private readonly bank = new SampleBank<SampleName>(BASE_URL, SAMPLES);
  private lastCoin = 0;
  private _volume = 0.8;

  // Anticipation & rouleaux
  private anticipTimer: ReturnType<typeof setInterval> | null = null;
  private rollTimer: ReturnType<typeof setInterval> | null = null;

  // Musique des Tours Gratuits
  private musicInterval: ReturnType<typeof setInterval> | null = null;
  private musicGain: GainNode | null = null;
  private musicStep = 0;

  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.bank.volume = this._volume;
    this.synth.volume = this._volume;
    if (this.musicGain && this.bank.context) {
      this.musicGain.gain.setValueAtTime(this.sfxMuted ? 0 : this._volume * 0.14, this.bank.context.currentTime);
    }
  }

  get sfxMuted() {
    return this.bank.muted;
  }
  set sfxMuted(v: boolean) {
    this.bank.muted = v;
    this.synth.muted = v;
    if (this.musicGain && this.bank.context) {
      this.musicGain.gain.setValueAtTime(v ? 0 : this._volume * 0.14, this.bank.context.currentTime);
    }
  }

  get muted() {
    return this.sfxMuted;
  }
  set muted(v: boolean) {
    this.sfxMuted = v;
  }

  /** À appeler sur un geste utilisateur */
  unlock(): void {
    this.synth.unlock();
    this.bank.unlock();
  }

  private play(name: SampleName, volume = 1, rate = 1): boolean {
    return this.bank.play(name, volume, rate);
  }

  private getAudioContext(): { ctx: AudioContext; out: GainNode } | null {
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.sfxMuted) return null;
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out };
  }

  // --- Effets généraux -------------------------------------------------------

  click() {
    this.synth.click();
  }

  /** Son de bascule du Boost Ante Bet (vrai commutateur mécanique + carillon) */
  boostToggle(enabled: boolean) {
    this.play('switch', enabled ? 1.0 : 0.85);
  }

  spinStart() {
    this.stopReelRoll();
    if (this.play('reelSpin', 0.80)) return;

    const actx = this.getAudioContext();
    if (!actx) {
      this.synth.spinStart();
      return;
    }
    const { ctx, out } = actx;
    const t = ctx.currentTime;

    // Doux roulement feutré de départ
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.25);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.30);

    // Carillon marimba doux Do-Mi-Sol
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const chime = ctx.createOscillator();
      chime.type = 'sine';
      const st = t + i * 0.04;
      chime.frequency.setValueAtTime(freq, st);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, st);
      cg.gain.exponentialRampToValueAtTime(0.05, st + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.18);
      chime.connect(cg).connect(out);
      chime.start(st);
      chime.stop(st + 0.20);
    });
  }

  /** Bruit de roulement mécanique continu pendant que les rouleaux tournent */
  startReelRoll() {
    this.stopReelRoll();
  }

  stopReelRoll() {
    if (this.rollTimer) {
      clearInterval(this.rollTimer);
      this.rollTimer = null;
    }
  }

  reelStop(reel: number, hasScatter: boolean) {
    if (reel === 4) this.stopReelRoll();
    this.synth.reelStop(reel, hasScatter);
  }

  /**
   * Chute d'un Scatter (patte BONUS) :
   * - 1er scatter : cloche joyeuse E5 (659 Hz) + aboiement court
   * - 2e scatter : cloche plus aiguë A5 (880 Hz) avec tension
   * - 3e scatter : bonus déclenché
   */
  scatterDrop(index: 1 | 2 | 3) {
    const actx = this.getAudioContext();
    if (index === 3) {
      this.bonusTrigger();
      return;
    }

    if (actx) {
      const { ctx, out } = actx;
      const t = ctx.currentTime;
      const freq = index === 1 ? 659.25 : 880.0;

      // Son de cloche étincelante
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.01, t + 0.3);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.48);
    }

    // Aboiement court d'encouragement
    this.play(index === 1 ? 'bark1' : 'bark2', 0.85, 1.05 + index * 0.1);
  }

  /** Tension montante Pragmatic Play quand les rouleaux 1 et 3 ont un scatter */
  anticipation() {
    this.startAnticipation();
  }

  startAnticipation() {
    this.stopAnticipation();
    let step = 0;
    const actx = this.getAudioContext();

    this.anticipTimer = setInterval(() => {
      step++;
      if (!actx) return;
      const { ctx, out } = actx;
      const t = ctx.currentTime;

      // Impulsion de basse rapide galopante
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const baseF = 220 + Math.min(320, step * 18);
      osc.frequency.setValueAtTime(baseF, t);
      osc.frequency.exponentialRampToValueAtTime(baseF * 1.5, t + 0.08);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseF * 2, t);
      filter.Q.value = 4.0;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      osc.connect(filter).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.1);
    }, 110);
  }

  stopAnticipation() {
    if (this.anticipTimer) {
      clearInterval(this.anticipTimer);
      this.anticipTimer = null;
    }
  }

  /**
   * Claquement lourd « SLAM » de Wild Collant (Tours Gratuits Pragmatic Play) :
   * Coup de marteau en bois puissant + aboiement jovial
   */
  stickyWildSlam() {
    this.play('slam', 1.0);
    const actx = this.getAudioContext();
    if (actx) {
      const { ctx, out } = actx;
      const t = ctx.currentTime;

      // 1. Impact bois / punch grave
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, t);
      sub.frequency.exponentialRampToValueAtTime(28, t + 0.12);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.55, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      sub.connect(sg).connect(out);
      sub.start(t);
      sub.stop(t + 0.15);

      // 2. Craquement sec de bois (planche verrouillée)
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(620, t);
      osc2.frequency.exponentialRampToValueAtTime(180, t + 0.07);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.3, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc2.connect(g2).connect(out);
      osc2.start(t);
      osc2.stop(t + 0.09);
    }

    // Aboiement puissant et enthousiaste
    this.play(Math.random() < 0.5 ? 'bark1' : 'bark2', 0.95, 1.05 + Math.random() * 0.1);
  }

  /** Son d'un gain amplifié par un multiplicateur de Wild (BOOST x2, x3, x9...) */
  multiplierBoost(mult: number) {
    const actx = this.getAudioContext();
    if (actx) {
      const { ctx, out } = actx;
      const t = ctx.currentTime;

      const chord = [523.25, 659.25, 783.99, 1046.5];
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const st = t + idx * 0.045;
        osc.frequency.setValueAtTime(freq * (1 + (mult >= 5 ? 0.25 : 0)), st);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.24, st + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
        osc.connect(g).connect(out);
        osc.start(st);
        osc.stop(st + 0.38);
      });
    }

    if (mult >= 3) {
      this.play('barkDouble', 0.85);
    }
  }

  // --- Intro des Tours Gratuits (grille 3x3 de barils) -----------------------

  /** Cliquetis d'un baril de tours gratuits qui tourne */
  barrelTick() {
    const actx = this.getAudioContext();
    if (!actx) return;
    const { ctx, out } = actx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320 + Math.random() * 80, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.02);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 3.0;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

    osc.connect(filter).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  /** Arrêt d'un baril 3x3 avec révélation du chiffre (1, 2 ou 3) */
  barrelStop(value: number, totalSoFar: number) {
    const actx = this.getAudioContext();
    if (actx) {
      const { ctx, out } = actx;
      const t = ctx.currentTime;

      // Clac de bois sec
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(160, t);
      sub.frequency.exponentialRampToValueAtTime(50, t + 0.07);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.3, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      sub.connect(sg).connect(out);
      sub.start(t);
      sub.stop(t + 0.09);

      // Carillon dont la hauteur monte avec le cumul de tours
      const noteFreq = 440 * Math.pow(1.045, Math.min(27, totalSoFar));
      const chime = ctx.createOscillator();
      chime.type = 'triangle';
      chime.frequency.setValueAtTime(noteFreq, t);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      chime.connect(cg).connect(out);
      chime.start(t);
      chime.stop(t + 0.3);
    }

    if (value === 3) {
      this.play('bark1', 0.65, 1.15);
    }
  }

  /** Fin du tirage des 9 barils : fanfare et aboiements joyeux */
  freeSpinsIntroComplete() {
    this.play('bonusTrigger', 0.9);
    this.play('barkDouble', 0.85);
  }

  // --- Musique procédurale festive de Tours Gratuits (Ragtime Banjo) ---------

  /**
   * Lance la musique d'ambiance entraînante des Tours Gratuits :
   * Progression country-ragtime festive en Do majeur avec basse sautillante
   * et accords en contre-temps façon dessin animé Pragmatic.
   */
  startFreeSpinsMusic() {
    this.stopFreeSpinsMusic();
    const actx = this.getAudioContext();
    if (!actx) return;
    const { ctx, out } = actx;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(this.sfxMuted ? 0 : 0.14, ctx.currentTime + 0.4);
    this.musicGain.connect(out);

    // Progression 4 mesures : C -> Am -> F -> G7 à 136 BPM (~110ms par double croche)
    const chords = [
      { bass: 130.81, notes: [261.63, 329.63, 392.0] }, // C
      { bass: 110.0, notes: [220.0, 261.63, 329.63] },  // Am
      { bass: 87.31, notes: [174.61, 220.0, 261.63] },  // F
      { bass: 98.0, notes: [196.0, 246.94, 293.66, 349.23] }, // G7
    ];

    this.musicStep = 0;
    const stepDuration = 0.22; // temps par demi-mesure

    this.musicInterval = setInterval(() => {
      if (!this.musicGain || this.sfxMuted) return;
      const t = ctx.currentTime;
      const chordIndex = Math.floor(this.musicStep / 2) % chords.length;
      const chord = chords[chordIndex];
      const isBeat = this.musicStep % 2 === 0;

      if (isBeat) {
        // Basse sautillante (alternance tonique / quinte)
        const bassOsc = ctx.createOscillator();
        bassOsc.type = 'triangle';
        const bassF = this.musicStep % 4 === 0 ? chord.bass : chord.bass * 1.5;
        bassOsc.frequency.setValueAtTime(bassF, t);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.28, t);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        bassOsc.connect(bg).connect(this.musicGain);
        bassOsc.start(t);
        bassOsc.stop(t + 0.2);
      } else {
        // Accords staccato syncopés en contre-temps (son banjo/piano vif)
        chord.notes.forEach((freq) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);

          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1400, t);
          filter.Q.value = 2.0;

          const g = ctx.createGain();
          g.gain.setValueAtTime(0.1, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

          osc.connect(filter).connect(g).connect(this.musicGain!);
          osc.start(t);
          osc.stop(t + 0.14);
        });
      }

      this.musicStep++;
    }, stepDuration * 1000);
  }

  stopFreeSpinsMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.musicGain && this.bank.context) {
      try {
        const t = this.bank.context.currentTime;
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, t + 0.45);
        setTimeout(() => {
          this.musicGain?.disconnect();
          this.musicGain = null;
        }, 500);
      } catch {
        this.musicGain = null;
      }
    }
  }

  bark() {
    if (!this.play(Math.random() < 0.5 ? 'bark1' : 'bark2', 0.8, 0.95 + Math.random() * 0.15)) this.synth.dogBark();
  }

  win(tier: 'small' | 'medium' | 'big') {
    const name = tier === 'small' ? 'winSmall' : tier === 'medium' ? 'winMedium' : 'winBig';
    if (!this.play(name, 0.75)) this.synth.winLine(tier);
  }

  bigWinStart() {
    if (!this.play('winBig', 0.9)) this.synth.jackpotFanfare();
    this.play('coinsShower', 0.7);
  }

  coinTick() {
    const now = performance.now();
    if (now - this.lastCoin < 85) return;
    this.lastCoin = now;
    const n = 1 + Math.floor(Math.random() * 3);
    this.play(`coin${n}` as SampleName, 0.35, 0.9 + Math.random() * 0.3);
  }

  bonusTrigger() {
    this.stopAnticipation();
    if (!this.play('bonusTrigger', 0.95)) this.synth.jackpotFanfare();
    this.play('barkDouble', 0.85);
  }

  bonusEnd() {
    this.stopFreeSpinsMusic();
    if (!this.play('bonusEnd', 0.95)) this.synth.jackpotFanfare();
  }

  close() {
    this.stopReelRoll();
    this.stopAnticipation();
    this.stopFreeSpinsMusic();
    this.bank.close();
    this.synth.close();
  }
}

