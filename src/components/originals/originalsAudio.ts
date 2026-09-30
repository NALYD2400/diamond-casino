import { SampleBank, getSharedAudioContext } from '../slots/sampleBank';

/** Échantillons réels déjà présents dans /public/sounds, utilisés par les Diamond Originals */
const SAMPLES = {
  deal: 'mines/deal.mp3',
  chip: 'mines/tile-click.mp3',
  hover: 'mines/tile-hover.mp3',
  explosion: 'mines/explosion.mp3',
  cashout: 'mines/cashout.mp3',
  winSmall: 'mines/win-small.mp3',
  winMedium: 'mines/win-medium.mp3',
  winBig: 'mines/win-big.mp3',
  coin1: 'mines/coin-1.mp3',
  coin2: 'mines/coin-2.mp3',
  coin3: 'mines/coin-3.mp3',
  shower: 'mines/coins-shower.mp3',
  flip1: 'boosters/flip-1.mp3',
  flip2: 'boosters/flip-2.mp3',
  flip3: 'boosters/flip-3.mp3',
  slide1: 'boosters/slide-1.mp3',
  slide2: 'boosters/slide-2.mp3',
  tick1: 'wheel/tick-1.mp3',
  tick2: 'wheel/tick-2.mp3',
  tick3: 'wheel/tick-3.mp3',
  bell: 'wheel/bell.mp3',
} as const;

export type OriginalsSample = keyof typeof SAMPLES;

/**
 * Sons des Diamond Originals : échantillons réels + synthèse Web Audio
 * (moteur de la fusée du Crash dont la hauteur suit le multiplicateur,
 * petits clics de secours si un fichier manque).
 */
export class OriginalsAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private _muted = false;
  private _volume = 0.8;
  private readonly bank = new SampleBank<OriginalsSample>('/sounds/', SAMPLES);

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    this.bank.muted = v;
    this.applyGain();
  }

  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.bank.volume = this._volume;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this._muted ? 0 : this._volume * 0.8, this.ctx.currentTime);
  }

  unlock(): void {
    this.bank.unlock();
    this.ctx = getSharedAudioContext();
    if (this.ctx && (!this.master || this.master.context !== this.ctx)) {
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyGain();
    }
  }

  /** Joue un échantillon ; renvoie false s'il n'est pas encore chargé */
  play(name: OriginalsSample, volume = 1, rate = 1): boolean {
    return this.bank.play(name, volume, rate);
  }

  playAny(names: OriginalsSample[], volume = 1, rate = 1): boolean {
    return this.play(names[Math.floor(Math.random() * names.length)], volume, rate);
  }

  /** Petit « tic » synthétique (secours et retours d'interface) */
  blip(freq = 880, dur = 0.05, vol = 0.25, type: OscillatorType = 'triangle'): void {
    if (!this.ctx || !this.master || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click(): void {
    if (!this.play('chip', 0.5, 1.15)) this.blip(1200, 0.03, 0.15);
  }

  // ---------------------------------------------------------------------------
  // Moteur de la fusée (Crash)
  // ---------------------------------------------------------------------------

  engineStart(): void {
    if (!this.ctx || !this.master || this.engine) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.setValueAtTime(70, t);
    osc2.frequency.setValueAtTime(71.5, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, t);
    filter.Q.value = 3;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.4);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start(t);
    osc2.start(t);
    this.engine = { osc, osc2, filter, gain };
  }

  /** La hauteur du moteur monte avec le multiplicateur */
  engineUpdate(mult: number): void {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const f = 70 + Math.min(420, Math.log(Math.max(1, mult)) * 95);
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(f * 1.02, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(380 + f * 3, t, 0.1);
  }

  engineStop(fade = 0.25): void {
    if (!this.ctx || !this.engine) return;
    const { osc, osc2, gain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + fade);
    osc.stop(t + fade + 0.05);
    osc2.stop(t + fade + 0.05);
    this.engine = null;
  }

  close(): void {
    this.engineStop(0.05);
    this.bank.close();
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
  }
}
