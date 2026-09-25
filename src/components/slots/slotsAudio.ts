/**
 * Web Audio API Sound Synthesizer for Diamond Slots Engine
 * 100% procedural sound synthesis: zero external audio assets, zero latency, offline-ready.
 */
export class SlotsAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;

        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(compressor).connect(this.ctx.destination);

        const length = Math.floor(this.ctx.sampleRate * 1.0);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      this.ctx = null;
    }
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || !this.master) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  /** Crisp mechanical button click */
  click(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.03);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  /** Mechanical spin engagement whoosh + motor start */
  spinStart(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;

    // Servo rise
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(340, t + 0.16);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(og).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.2);

    // Air whoosh
    const src = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + 0.18);
    filter.Q.value = 2.0;

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    src.connect(filter).connect(ng).connect(this.master!);
    src.start(t);
    src.stop(t + 0.22);
  }

  /** Soft mechanical tick during reel rotation */
  reelTick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.015);
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.02);
  }

  /**
   * Satisfying heavy mechanical lock when a reel stops.
   * If `hasScatter` is true, adds a bright crystalline harmonic chime.
   */
  reelStop(reelIndex: number, hasScatter = false): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;

    // Low mechanical thud ascending slightly per reel
    const baseFreq = 130 + reelIndex * 16;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(baseFreq, t);
    sub.frequency.exponentialRampToValueAtTime(48, t + 0.08);

    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.32, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    sub.connect(sg).connect(this.master!);
    sub.start(t);
    sub.stop(t + 0.1);

    // Crisp transient click
    const snap = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2100 + reelIndex * 180;
    filter.Q.value = 3.0;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.15, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    snap.connect(filter).connect(ng).connect(this.master!);
    snap.start(t);
    snap.stop(t + 0.035);

    if (hasScatter) {
      const chime = ctx.createOscillator();
      chime.type = 'triangle';
      const chimeFreq = 587.33 * Math.pow(1.12246, reelIndex * 2); // Rising D5 -> E5 -> F#5...
      chime.frequency.setValueAtTime(chimeFreq, t);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.24, t + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      chime.connect(cg).connect(this.master!);
      chime.start(t);
      chime.stop(t + 0.38);
    }
  }

  /** Dramatic rising synth pulse when waiting for 3rd scatter */
  anticipation(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.45);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.45);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);

    osc.connect(filter).connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  /** Standard line win chime */
  winLine(tier: 'small' | 'medium' | 'big' = 'small'): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const notes =
      tier === 'big'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
        : tier === 'medium'
          ? [523.25, 659.25, 783.99, 1046.5]
          : [587.33, 880.0, 1174.66];

    notes.forEach((freq, idx) => {
      const st = t + idx * 0.065;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.22, st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.42);

      osc.connect(g).connect(this.master!);
      osc.start(st);
      osc.stop(st + 0.45);
    });

    if (tier !== 'small') {
      // Coin cascade shimmer
      for (let i = 0; i < (tier === 'big' ? 10 : 5); i++) {
        const ct = t + 0.25 + i * 0.05;
        const coin = ctx.createOscillator();
        coin.type = 'sine';
        coin.frequency.setValueAtTime(1900 + (i % 4) * 350, ct);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, ct);
        cg.gain.exponentialRampToValueAtTime(0.08, ct + 0.005);
        cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.12);
        coin.connect(cg).connect(this.master!);
        coin.start(ct);
        coin.stop(ct + 0.14);
      }
    }
  }

  /** Free Spins / Jackpot grand fanfare */
  jackpotFanfare(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const fanfare = [
      { f: 523.25, d: 0.0, len: 0.25 },
      { f: 659.25, d: 0.12, len: 0.25 },
      { f: 783.99, d: 0.24, len: 0.25 },
      { f: 1046.5, d: 0.36, len: 0.65 },
      { f: 783.99, d: 0.55, len: 0.2 },
      { f: 1046.5, d: 0.72, len: 0.9 },
    ];

    fanfare.forEach((n) => {
      const st = t + n.d;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(n.f, st);
      osc2.frequency.setValueAtTime(n.f * 1.5, st);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.25, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + n.len);

      osc1.connect(g).connect(this.master!);
      osc2.connect(g).connect(this.master!);
      osc1.start(st);
      osc2.start(st);
      osc1.stop(st + n.len + 0.05);
      osc2.stop(st + n.len + 0.05);
    });
  }

  /** Synthesized playful dog bark for The Dog House wins */
  dogBark(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(350, t + 0.13);
    filter.Q.value = 2.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(filter).connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  close(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
