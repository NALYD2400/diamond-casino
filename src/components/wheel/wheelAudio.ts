import { SampleBank, getSharedAudioContext } from '../slots/sampleBank';

const BASE_URL = '/sounds/wheel/';

const SAMPLES = {
  spin: 'spin.mp3',
  tick1: 'tick-1.mp3',
  tick2: 'tick-2.mp3',
  tick3: 'tick-3.mp3',
  stop: 'stop.mp3',
  suspense: 'suspense.mp3',
  bell: 'bell.mp3',
  winSmall: 'win-small.mp3',
  winMedium: 'win-medium.mp3',
  winBig: 'win-big.mp3',
  coin1: 'coin-1.mp3',
  coin2: 'coin-2.mp3',
  coin3: 'coin-3.mp3',
  coinsShower: 'coins-shower.mp3',
} as const;

type WheelSampleName = keyof typeof SAMPLES;

/**
 * Realistic sound design for the fortune wheel:
 * - Real recorded mechanical flapper ratchet clicks against pegs
 * - Real mechanical wheel spin whirr
 * - Real casino jackpot bells and celebration jingles
 * - Web Audio procedural synthesis as zero-dependency fallback
 */
export class WheelAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drone: { nodes: AudioScheduledSourceNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private lastTickAt = 0;
  private _muted = false;
  private _volume = 0.8;
  private readonly bank = new SampleBank<WheelSampleName>(BASE_URL, SAMPLES);

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
    if (this.master && this.ctx) {
      const target = this._muted ? 0 : this._volume * 0.9;
      this.master.gain.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  unlock(): void {
    this.bank.unlock();
    try {
      this.ctx = getSharedAudioContext();
      if (this.ctx && (!this.master || this.master.context !== this.ctx)) {
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.gain.value = this._muted ? 0 : this._volume * 0.9;
        this.master.connect(compressor).connect(this.ctx.destination);

        const length = Math.floor(this.ctx.sampleRate * 1.5);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ready(): AudioContext | null {
    return this._muted || !this.ctx || !this.master ? null : this.ctx;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  /** Launch: subtle mechanical wheel spin whoosh & bearing engagement */
  whoosh(): void {
    if (this.bank.play('spin', 0.50)) return;
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.58);
  }

  /** Ratchet click when a stud hits the flapper. `speed` 0..1 (1 = full speed). */
  tick(speed: number): void {
    const now = performance.now();
    // Progressive throttle at high speed to avoid an abrasive machine-gun burst
    const minInterval = speed > 0.65 ? 36 : 22;
    if (now - this.lastTickAt < minInterval) return;
    this.lastTickAt = now;

    // Soft, realistic mechanical flapper ratchet clicks against brass pins
    const pick = (Math.random() < 0.4 ? 'tick1' : Math.random() < 0.7 ? 'tick2' : 'tick3') as WheelSampleName;
    const rate = 0.94 + 0.14 * speed + (Math.random() * 0.06 - 0.03);
    // Subtle, balanced volume: soft flutter at high speed, satisfying tactile pop at slow speed
    const volume = 0.20 + 0.14 * (1 - speed);

    if (this.bank.play(pick, volume, rate)) {
      return;
    }

    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const synthVolume = 0.10 + 0.08 * (1 - speed);

    // Warm, muted wooden/leather flapper click (no piercing highs)
    const click = this.noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1350 - 350 * (1 - speed);
    bp.Q.value = 1.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(synthVolume, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    click.connect(bp).connect(lp).connect(clickGain).connect(this.master!);
    click.start(t, Math.random() * 1.2);
    click.stop(t + 0.025);

    // Subtle low-mid wooden resonance
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(260, t);
    body.frequency.exponentialRampToValueAtTime(85, t + 0.04);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(synthVolume * 0.55, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    body.connect(bodyGain).connect(this.master!);
    body.start(t);
    body.stop(t + 0.05);
  }

  /** Stop mechanical latch impact when the wheel settles */
  stop(): void {
    this.bank.play('stop', 1.0);
  }

  /** Rising tension drone for the final crawl */
  startSuspense(durationSec: number): void {
    if (this.bank.play('suspense', 0.85)) return;
    const ctx = this.ready();
    if (!ctx || this.drone) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(480, t + durationSec);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + durationSec * 0.8);
    filter.connect(gain).connect(this.master!);

    const nodes: AudioScheduledSourceNode[] = [];
    [55, 110, 165].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.25, t + durationSec);
      osc.connect(filter);
      osc.start(t);
      nodes.push(osc);
    });

    // Heartbeat pulse speeding up
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(1.4, t);
    lfo.frequency.linearRampToValueAtTime(4.5, t + durationSec);
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start(t);
    nodes.push(lfo);

    this.drone = { nodes, gain, filter };
  }

  stopSuspense(): void {
    const ctx = this.ctx;
    const drone = this.drone;
    this.drone = null;
    if (!ctx || !drone) return;
    const t = ctx.currentTime;
    drone.gain.gain.cancelScheduledValues(t);
    drone.gain.gain.setValueAtTime(Math.max(drone.gain.gain.value, 0.0001), t);
    drone.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    drone.nodes.forEach((n) => {
      try {
        n.stop(t + 0.3);
      } catch {
        // already stopped
      }
    });
  }

  /** Stop impact + victory fanfare (longer for rare prizes) */
  win(big: boolean): void {
    this.bank.play('bell', 0.9);
    if (this.bank.play(big ? 'winBig' : 'winMedium', 0.95)) {
      this.bank.play('coinsShower', 0.7);
      return;
    }
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Low impact
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(140, t);
    thud.frequency.exponentialRampToValueAtTime(45, t + 0.35);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.5, t);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    thud.connect(thudGain).connect(this.master!);
    thud.start(t);
    thud.stop(t + 0.42);

    const notes = big
      ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51, 1567.98]
      : [659.25, 783.99, 1046.5, 1318.51];
    const step = big ? 0.13 : 0.11;
    notes.forEach((freq, i) => {
      const start = t + 0.15 + i * step;
      const last = i === notes.length - 1;
      const len = last ? 1.4 : 0.5;
      ['triangle', 'sine'].forEach((type, k) => {
        const osc = ctx.createOscillator();
        osc.type = type as OscillatorType;
        osc.frequency.setValueAtTime(freq * (k ? 2 : 1), start);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(k ? 0.04 : 0.16, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, start + len);
        osc.connect(g).connect(this.master!);
        osc.start(start);
        osc.stop(start + len + 0.05);
      });
    });

    // Sparkle shimmer
    const sparkleStart = t + 0.15 + notes.length * step;
    for (let i = 0; i < (big ? 14 : 7); i++) {
      const s = sparkleStart + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2000 + Math.random() * 2500, s);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.25);
      osc.connect(g).connect(this.master!);
      osc.start(s);
      osc.stop(s + 0.3);
    }
  }

  close(): void {
    this.stopSuspense();
    this.bank.close();
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
  }
}

