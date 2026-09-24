/**
 * Web Audio API Sound Synthesizer for the Mines Game (The Diamond Casino & Resort)
 * 100% synthesized sound design: zero external MP3 assets, zero latency, runs offline.
 */
export class MinesAudio {
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
        compressor.threshold.value = -12;
        compressor.knee.value = 8;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;

        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(compressor).connect(this.ctx.destination);

        // Pre-create 1-second white noise buffer for clicks & blast
        const length = Math.floor(this.ctx.sampleRate * 1.2);
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

  /** Soft mechanical tile hover / focus tick */
  hover(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.02);
    g.gain.setValueAtTime(0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.025);
  }

  /** Satisfying mechanical card/tile click */
  click(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;

    // High snap
    const snap = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value = 3.5;
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.18, t);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    snap.connect(filter).connect(snapGain).connect(this.master!);
    snap.start(t);
    snap.stop(t + 0.035);

    // Deep body knock
    const knock = ctx.createOscillator();
    knock.type = 'sine';
    knock.frequency.setValueAtTime(320, t);
    knock.frequency.exponentialRampToValueAtTime(80, t + 0.04);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(0.25, t);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    knock.connect(knockGain).connect(this.master!);
    knock.start(t);
    knock.stop(t + 0.05);
  }

  /** Game start deal sound (crisp casino card deal whoosh) */
  start(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;

    const whoosh = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

    whoosh.connect(filter).connect(gain).connect(this.master!);
    whoosh.start(t);
    whoosh.stop(t + 0.3);
  }

  /**
   * Sparkling crystal chime when revealing a diamond / gem.
   * Pitch dynamically ascends musically with `step` (1, 2, 3...)
   * creating an exhilarating rush as the combo grows!
   */
  gem(step: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Musical scale: pentatonic major + octaves
    const scale = [
      523.25, // C5
      587.33, // D5
      659.25, // E5
      783.99, // G5
      880.0,  // A5
      1046.5, // C6
      1174.66,// D6
      1318.51,// E6
      1567.98,// G6
      1760.0, // A6
      2093.0, // C7
      2349.32,// D7
      2637.02,// E7
    ];
    const noteIdx = Math.min(Math.max(0, step - 1), scale.length - 1);
    const baseFreq = scale[noteIdx];

    // Primary crystalline bell (Sine + Triangle overtone)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(baseFreq, t);
    osc2.frequency.setValueAtTime(baseFreq * 2, t);

    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    gain1.gain.setValueAtTime(0.0001, t);
    gain1.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

    gain2.gain.setValueAtTime(0.0001, t);
    gain2.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    osc1.connect(gain1).connect(this.master!);
    osc2.connect(gain2).connect(this.master!);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.48);
    osc2.stop(t + 0.35);

    // High sparkle shimmer
    for (let i = 0; i < 3; i++) {
      const st = t + 0.04 + i * 0.035;
      const spk = ctx.createOscillator();
      spk.type = 'sine';
      spk.frequency.setValueAtTime(baseFreq * (2.5 + i * 0.75), st);
      const spkGain = ctx.createGain();
      spkGain.gain.setValueAtTime(0.0001, st);
      spkGain.gain.exponentialRampToValueAtTime(0.06, st + 0.008);
      spkGain.gain.exponentialRampToValueAtTime(0.0001, st + 0.18);
      spk.connect(spkGain).connect(this.master!);
      spk.start(st);
      spk.stop(st + 0.2);
    }
  }

  /**
   * Mine explosion sound: thunderous sub-bass thump + sizzling fire blast
   */
  explosion(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;

    // Sub-bass thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(180, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.55);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.55, t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    sub.connect(subGain).connect(this.master!);
    sub.start(t);
    sub.stop(t + 0.65);

    // Charred blast noise
    const blast = this.noiseSource(ctx);
    const blastFilter = ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(3200, t);
    blastFilter.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    blastFilter.Q.value = 3;

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.0001, t);
    blastGain.gain.exponentialRampToValueAtTime(0.42, t + 0.02);
    blastGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

    blast.connect(blastFilter).connect(blastGain).connect(this.master!);
    blast.start(t);
    blast.stop(t + 0.6);
  }

  /**
   * Cashout Victory: triumphant ascending chord fanfare + golden coin chimes
   */
  cashout(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Triumphant fanfare chord: C5 - E5 - G5 - C6
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, idx) => {
      const st = t + idx * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, st);
      gain.gain.exponentialRampToValueAtTime(0.24, st + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.6);

      osc.connect(gain).connect(this.master!);
      osc.start(st);
      osc.stop(st + 0.65);
    });

    // Cascading coin drops
    const coinStart = t + 0.35;
    for (let i = 0; i < 6; i++) {
      const ct = coinStart + i * 0.055;
      const coin = ctx.createOscillator();
      coin.type = 'sine';
      coin.frequency.setValueAtTime(1800 + (i % 3) * 400 + Math.random() * 200, ct);
      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0.0001, ct);
      cGain.gain.exponentialRampToValueAtTime(0.09, ct + 0.005);
      cGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.12);
      coin.connect(cGain).connect(this.master!);
      coin.start(ct);
      coin.stop(ct + 0.15);
    }
  }

  close(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
