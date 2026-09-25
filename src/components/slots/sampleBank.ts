/**
 * Banque d'échantillons audio (Web Audio) : chargement paresseux au premier geste
 * utilisateur, lecture avec volume et vitesse. `play` renvoie false tant que le
 * son n'est pas disponible, pour permettre un son de secours synthétisé.
 */
export class SampleBank<Name extends string> {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<Name, AudioBuffer>();
  private loading = false;
  private _muted = false;

  private readonly baseUrl: string;
  private readonly files: Record<Name, string>;

  constructor(baseUrl: string, files: Record<Name, string>) {
    this.baseUrl = baseUrl;
    this.files = files;
  }

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    if (this.out) this.out.gain.value = v ? 0 : 1;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }
  get output(): GainNode | null {
    return this.out;
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.out = this.ctx.createGain();
        this.out.gain.value = this._muted ? 0 : 1;
        this.out.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    await Promise.all(
      (Object.keys(this.files) as Name[]).map(async (name) => {
        try {
          const res = await fetch(this.baseUrl + this.files[name]);
          if (!res.ok) return;
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Échantillon indisponible : l'appelant jouera son son de secours
        }
      }),
    );
  }

  play(name: Name, volume = 1, rate = 1): boolean {
    const buf = this.buffers.get(name);
    if (!this.ctx || !this.out || !buf) return false;
    if (this._muted) return true;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.out);
    src.start();
    return true;
  }

  close(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.out = null;
  }
}
