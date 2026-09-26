import { SlotsAudio } from '../slots/slotsAudio';
import { SampleBank } from '../slots/sampleBank';

/**
 * Audio de Wanted Dead or a Wild fidèle à l'ambiance western Hacksaw Gaming :
 * - Jingles et pièces CC0 (public/sounds/wanted, voir CREDITS.txt)
 * - Tirs de revolver, ricochets métalliques, affrontements de duels VS
 * - Cloche d'église funèbre et tension de barillet pour Dead Man's Hand
 * - Sifflet de train à vapeur pour The Great Train Robbery
 * - Sons d'anticipation et chutes de scatters progressives
 */

const SAMPLES = {
  winSmall: 'win-small.mp3',
  winMedium: 'win-medium.mp3',
  winBig: 'win-big.mp3',
  bonusTrigger: 'bonus-trigger.mp3',
  bonusEnd: 'bonus-end.mp3',
  collect: 'collect.mp3',
  coin1: 'coin-1.mp3',
  coin2: 'coin-2.mp3',
  coin3: 'coin-3.mp3',
  coinsShower: 'coins-shower.mp3',
  gunshot: 'gunshot.mp3',
  ricochet: 'ricochet.mp3',
  duel: 'duel.mp3',
  churchBell: 'church-bell.mp3',
} as const;

type SampleName = keyof typeof SAMPLES;

export class WantedAudio {
  readonly synth = new SlotsAudio();
  private readonly bank = new SampleBank<SampleName>('/sounds/wanted/', SAMPLES);
  private noise: AudioBuffer | null = null;
  private lastCoin = 0;
  private anticipTimer: ReturnType<typeof setInterval> | null = null;

  get volume() {
    return this.bank.volume;
  }
  set volume(v: number) {
    this.bank.volume = v;
    this.synth.volume = v;
  }

  get muted() {
    return this.bank.muted;
  }
  set muted(v: boolean) {
    this.bank.muted = v;
    this.synth.muted = v;
  }

  unlock(): void {
    this.synth.unlock();
    this.bank.unlock();
  }

  click() {
    this.synth.click();
  }
  spinStart() {
    this.synth.spinStart();
  }
  reelStop(reel: number, hasScatter: boolean) {
    this.synth.reelStop(reel, hasScatter);
  }

  anticipation() {
    this.startAnticipation();
  }

  /** Chute de scatter (DEAD, DUEL ou FS) : armement métallique sec de percuteur */
  scatterDrop(count: number) {
    this.synth.click();
    this.bank.play('churchBell', 0.85, count === 1 ? 0.9 : count === 2 ? 1.05 : 1.25);
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.bank.muted) return;
    const t = ctx.currentTime;

    // Clic sec d'armement métallique (hammer cock)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const baseF = count === 1 ? 520 : count === 2 ? 740 : 1040;
    osc.frequency.setValueAtTime(baseF, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.13);

    // Cloche sourde western en arrière-plan
    const bell = ctx.createOscillator();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(count === 1 ? 261.63 : count === 2 ? 329.63 : 392.0, t + 0.02);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.18, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    bell.connect(bg).connect(out);
    bell.start(t + 0.02);
    bell.stop(t + 0.48);
  }

  /** Bourdonnement de basse tendu western quand deux scatters ou un VS sont en jeu */
  startAnticipation() {
    this.stopAnticipation();
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.bank.muted) return;

    this.anticipTimer = setInterval(() => {
      if (this.bank.muted || !this.bank.context) return;
      const t = ctx.currentTime;

      // Battement de coeur lourd et sourd
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(75, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.12);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.18);
    }, 180);
  }

  stopAnticipation() {
    if (this.anticipTimer) {
      clearInterval(this.anticipTimer);
      this.anticipTimer = null;
    }
  }

  /** Coup de revolver : vrai tir western percutant */
  gunshot(volume = 0.9) {
    if (this.bank.play('gunshot', volume)) return;
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.bank.muted) return;
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 0.6);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5200, t);
    filter.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(filter).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.5);

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(volume * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Affrontement Duel VS : coup de feu percutant avec ricochet aigu métallique
   * et impact de multiplicateur
   */
  vsClash(multiplier = 2) {
    this.gunshot(0.95);
    this.bank.play('duel', 0.95);
    this.bank.play('ricochet', 0.85);
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.bank.muted) return;
    const t = ctx.currentTime + 0.06;

    // Ricochet siffleur métallique (whistle ricochet fallback)
    const rico = ctx.createOscillator();
    rico.type = 'sine';
    rico.frequency.setValueAtTime(1800, t);
    rico.frequency.exponentialRampToValueAtTime(3400, t + 0.08);
    rico.frequency.exponentialRampToValueAtTime(900, t + 0.22);

    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.2, t);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    rico.connect(rg).connect(out);
    rico.start(t);
    rico.stop(t + 0.26);

    // Si gros multiplicateur (>= 10x), impact lourd de basse supplémentaire
    if (multiplier >= 10) {
      const boom = ctx.createOscillator();
      boom.type = 'triangle';
      boom.frequency.setValueAtTime(110, t);
      boom.frequency.exponentialRampToValueAtTime(25, t + 0.35);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.4, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      boom.connect(bg).connect(out);
      boom.start(t);
      boom.stop(t + 0.42);
    }
  }

  /** Rechargement de barillet métallique pour Dead Man's Hand */
  revolverReload() {
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.bank.muted) return;
    const t = ctx.currentTime;

    [0, 0.035, 0.07, 0.11].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1600 + idx * 120, t + delay);
      osc.frequency.exponentialRampToValueAtTime(600, t + delay + 0.02);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.025);

      osc.connect(g).connect(out);
      osc.start(t + delay);
      osc.stop(t + delay + 0.03);
    });
  }

  /** Sifflet de locomotive à vapeur pour The Great Train Robbery */
  trainWhistle() {
    const ctx = this.bank.context;
    const out = this.bank.output;
    if (!ctx || !out || this.bank.muted) return;
    const t = ctx.currentTime;

    const chords = [587.33, 739.99, 880.0]; // D5, F#5, A5
    chords.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq, t);
      filter.Q.value = 6;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

      osc.connect(filter).connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  win(tier: 'small' | 'medium' | 'big') {
    const name = tier === 'small' ? 'winSmall' : tier === 'medium' ? 'winMedium' : 'winBig';
    if (!this.bank.play(name, 0.7)) this.synth.winLine(tier);
  }

  bigWinStart() {
    if (!this.bank.play('winBig', 0.9)) this.synth.jackpotFanfare();
    this.bank.play('coinsShower', 0.7);
  }

  coinTick() {
    const now = performance.now();
    if (now - this.lastCoin < 85) return;
    this.lastCoin = now;
    this.bank.play(`coin${1 + Math.floor(Math.random() * 3)}` as SampleName, 0.35, 0.9 + Math.random() * 0.3);
  }

  collect() {
    this.revolverReload();
    if (!this.bank.play('collect', 0.7)) this.synth.click();
  }

  bonusTrigger(bonus?: 'gtr' | 'duel' | 'dmh') {
    this.stopAnticipation();
    if (bonus === 'gtr') {
      this.trainWhistle();
    } else {
      this.gunshot();
    }
    if (!this.bank.play('bonusTrigger', 0.9)) this.synth.jackpotFanfare();
  }

  bonusEnd() {
    this.stopAnticipation();
    if (!this.bank.play('bonusEnd', 0.9)) this.synth.jackpotFanfare();
  }

  close() {
    this.stopAnticipation();
    this.bank.close();
    this.synth.close();
    this.noise = null;
  }
}
