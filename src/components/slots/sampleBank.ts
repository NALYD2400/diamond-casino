/**
 * Banque d'échantillons audio (Web Audio) :
 * - Préchargement anticipé des fichiers pour éliminer la latence et les bruits de secours
 * - Contrôle complet du volume (0..1) et de la sourdine
 * - Cache partagé des tampons décodés entre composants
 * - Instance AudioContext singleton partagée (évite le plafond de 6 contextes par navigateur)
 * - Déverrouillage automatique dès la première interaction utilisateur sur la page
 */

const globalAudioBufferCache = new Map<string, AudioBuffer>();
const globalArrayBufferCache = new Map<string, Promise<ArrayBuffer | null>>();
let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      sharedAudioContext = new Ctor();
    } catch {
      sharedAudioContext = null;
    }
  }
  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

if (typeof window !== 'undefined') {
  const earlyUnlock = () => {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', earlyUnlock);
    window.removeEventListener('keydown', earlyUnlock);
    window.removeEventListener('touchstart', earlyUnlock);
  };
  window.addEventListener('pointerdown', earlyUnlock, { passive: true });
  window.addEventListener('keydown', earlyUnlock, { passive: true });
  window.addEventListener('touchstart', earlyUnlock, { passive: true });
}

function fetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  let promise = globalArrayBufferCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
    globalArrayBufferCache.set(url, promise);
  }
  return promise;
}

export class SampleBank<Name extends string> {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<Name, AudioBuffer>();
  private loading = false;
  private _muted = false;
  private _volume = 0.8;

  private readonly baseUrl: string;
  private readonly files: Record<Name, string>;

  constructor(baseUrl: string, files: Record<Name, string>) {
    this.baseUrl = baseUrl;
    this.files = files;
    this.preload();
  }

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    this.applyGain();
  }

  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }
  get output(): GainNode | null {
    return this.out;
  }

  private applyGain(): void {
    if (this.out && this.ctx) {
      const target = this._muted ? 0 : this._volume;
      this.out.gain.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  /** Pré-charge les fichiers en mémoire dès l'instanciation */
  preload(): void {
    if (typeof window === 'undefined') return;
    for (const file of Object.values(this.files) as string[]) {
      void fetchArrayBuffer(this.baseUrl + file);
    }
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    this.ctx = getSharedAudioContext();
    if (this.ctx) {
      if (!this.out) {
        this.out = this.ctx.createGain();
        this.out.gain.value = this._muted ? 0 : this._volume;
        this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    }
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    await Promise.all(
      (Object.keys(this.files) as Name[]).map(async (name) => {
        try {
          const url = this.baseUrl + this.files[name];
          let cached = globalAudioBufferCache.get(url);
          if (!cached) {
            const ab = await fetchArrayBuffer(url);
            if (!ab) return;
            cached = await ctx.decodeAudioData(ab.slice(0));
            globalAudioBufferCache.set(url, cached);
          }
          this.buffers.set(name, cached);
        } catch {
          // Échantillon indisponible : l'appelant jouera son son de secours
        }
      }),
    );
  }

  play(name: Name, volume = 1, rate = 1): boolean {
    const buf = this.buffers.get(name);
    if (!this.ctx || !this.out || !buf) return false;
    if (this._muted || this._volume <= 0) return true;
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
    this.out?.disconnect();
    this.out = null;
    this.ctx = null;
  }
}

