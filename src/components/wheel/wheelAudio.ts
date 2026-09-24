/**
 * Synthesised sound design for the fortune wheel (Web Audio API, no audio files).
 * The AudioContext must be created from a user gesture: call `unlock()` in the click handler.
 */
export class WheelAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drone: { nodes: AudioScheduledSourceNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private lastTickAt = 0;
  muted = false;

  unlock(): void {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(compressor).connect(this.ctx.destination);

        const length = Math.floor(this.ctx.sampleRate * 1.5);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ready(): AudioContext | null {
    return this.muted || !this.ctx || !this.master ? null : this.ctx;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  /** Launch: airy whoosh */
  whoosh(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(2800, t);
    filter.frequency.exponentialRampToValueAtTime(350, t + 1.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + 1.25);
  }

  /** Ratchet click when a stud hits the flapper. `speed` 0..1 (1 = full speed). */
  tick(speed: number): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const now = performance.now();
    if (now - this.lastTickAt < 18) return; // avoid a wall of sound at full speed
    this.lastTickAt = now;

    const t = ctx.currentTime;
    const volume = 0.22 + 0.18 * (1 - speed); // slower = more distinct, heavier clicks

    // Sharp wooden click
    const click = this.noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200 - 1200 * (1 - speed);
    hp.Q.value = 2.5;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(volume, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    click.connect(hp).connect(clickGain).connect(this.master!);
    click.start(t, Math.random() * 1.2);
    click.stop(t + 0.03);

    // Body knock
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(420, t);
    body.frequency.exponentialRampToValueAtTime(110, t + 0.05);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(volume * 0.8, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    body.connect(bodyGain).connect(this.master!);
    body.start(t);
    body.stop(t + 0.07);
  }

  /** Rising tension drone for the final crawl */
  startSuspense(durationSec: number): void {
    const ctx = this.ready();
    if (!ctx || this.drone) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(1400, t + durationSec);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + durationSec * 0.8);
    filter.connect(gain).connect(this.master!);

    const nodes: AudioScheduledSourceNode[] = [];
    [55, 55.6, 82.4].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.5, t + durationSec);
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
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
