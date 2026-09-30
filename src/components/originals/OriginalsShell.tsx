import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Copy, Info, Menu, X } from 'lucide-react';
import { FullscreenButton } from '../FullscreenButton';
import { GameVolumeButton } from '../VolumeControl';
import { OriginalsAudio } from './originalsAudio';
import './originals.css';

export const fmt = (n: number, digits = 2) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits });
export const fmtMult = (m: number) => `${m.toFixed(2).replace('.', ',')}×`;

export type PlayMode = 'real' | 'demo';

// =============================================================================
// Hooks
// =============================================================================

/** Son partagé (sourdine + volume mémorisés comme sur les autres machines) */
export function useOriginalsSound() {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('diamond_sound_muted') === 'true';
    } catch {
      return false;
    }
  });
  const [volume, setVolumeState] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem('diamond_sound_volume') ?? '');
      return !isNaN(v) && v >= 0 && v <= 1 ? v : 0.8;
    } catch {
      return 0.8;
    }
  });
  const audioRef = useRef<OriginalsAudio | null>(null);
  if (!audioRef.current) audioRef.current = new OriginalsAudio();
  const audio = audioRef.current;
  audio.volume = volume;
  audio.muted = muted;
  useEffect(() => () => audio.close(), [audio]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem('diamond_sound_muted', String(!m));
      } catch {}
      return !m;
    });
  }, []);
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
    try {
      localStorage.setItem('diamond_sound_volume', String(clamped));
      if (clamped > 0) localStorage.setItem('diamond_sound_muted', 'false');
    } catch {}
  }, []);
  return { audio, muted, volume, toggleMute, setVolume };
}

/** Solde du mode démo, gardé dans le navigateur */
export function useDemoBalance(key: string, start = 10000) {
  const [demo, setDemo] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return saved > 0 ? saved : start;
    } catch {
      return start;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(demo));
    } catch {}
  }, [key, demo]);
  return [demo, setDemo, start] as const;
}

/** Mode jetons / démo : démo par défaut si le joueur n'est pas connecté ou n'a pas de jetons */
export function usePlayMode(isAuthenticated: boolean, chips: number | undefined) {
  const [mode, setMode] = useState<PlayMode>(() => (isAuthenticated && (chips ?? 0) > 0 ? 'real' : 'demo'));
  useEffect(() => {
    if (!isAuthenticated && mode === 'real') setMode('demo');
  }, [isAuthenticated, mode]);
  return [mode, setMode] as const;
}

/** Gestion de la mise : saisie libre bornée, ½, ×2, min, max */
export function useBet(minBet: number, maxBet: number, initial = 100) {
  const [bet, setBetRaw] = useState(() => Math.min(maxBet, Math.max(minBet, initial)));
  const clamp = useCallback((v: number) => Math.min(maxBet, Math.max(minBet, Math.floor(v) || minBet)), [minBet, maxBet]);
  useEffect(() => setBetRaw((b) => clamp(b)), [clamp]);
  const setBet = useCallback((v: number) => setBetRaw(clamp(v)), [clamp]);
  return { bet, setBet, clamp };
}

// =============================================================================
// Cadre commun
// =============================================================================

export interface Theme {
  /** Couleur d'accent principale (bouton JETONS, curseurs) */
  accent: string;
  /** Texte sur fond accent */
  accentText: string;
  /** Classe Tailwind accent-* pour les curseurs de volume */
  accentClass: string;
}

export const TopBar: React.FC<{
  mode: PlayMode;
  onMode: (m: PlayMode) => void;
  locked: boolean;
  isAuthenticated: boolean;
  theme: Theme;
  onMenu: () => void;
  onInfo: () => void;
  muted: boolean;
  volume: number;
  onMute: () => void;
  onVolume: (v: number) => void;
}> = ({ mode, onMode, locked, isAuthenticated, theme, onMenu, onInfo, muted, volume, onMute, onVolume }) => (
  <div className="relative z-30 flex items-center justify-between gap-2 px-3 sm:px-6 pt-6 sm:pt-8">
    <div className="flex items-center gap-2">
      <Link
        to="/jeux"
        className="flex items-center gap-2 rounded-full bg-black/80 hover:bg-black border border-white/20 hover:border-white/40 shadow-lg backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
      >
        <ArrowLeft size={16} /> Lobby
      </Link>
      <FullscreenButton />
    </div>
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex items-center gap-3 rounded-full bg-black/70 border border-white/15 px-3 py-2 text-white/85">
        <button onClick={onMenu} title="Menu" aria-label="Menu" className="hover:text-white">
          <Menu size={17} />
        </button>
        <button onClick={onInfo} title="Règles" aria-label="Règles" className="hover:text-white">
          <Info size={17} />
        </button>
        <GameVolumeButton muted={muted} volume={volume} onMute={onMute} onVolumeChange={onVolume} accentClass={theme.accentClass} />
      </div>
      <div className="flex items-center rounded-full bg-black/80 border border-white/20 shadow-lg backdrop-blur-md p-1 sm:p-1.5 text-xs sm:text-sm font-extrabold tracking-wide">
        <button
          onClick={() => !locked && isAuthenticated && onMode('real')}
          disabled={locked || !isAuthenticated}
          title={isAuthenticated ? 'Jouer avec vos jetons' : 'Connectez-vous pour jouer avec vos jetons'}
          className={`px-3.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === 'real' ? 'font-black shadow-md' : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
          style={mode === 'real' ? { background: theme.accent, color: theme.accentText } : undefined}
        >
          JETONS
        </button>
        <button
          onClick={() => !locked && onMode('demo')}
          disabled={locked}
          className={`px-3.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all ${
            mode === 'demo' ? 'bg-white text-black font-black shadow-md' : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          DÉMO
        </button>
      </div>
    </div>
  </div>
);

/** Panneau de commandes (colonne gauche sur ordinateur, sous le jeu sur mobile) */
export const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border-[3px] border-[#140c22] bg-[linear-gradient(180deg,rgba(30,22,52,0.94),rgba(12,8,24,0.96))] shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur p-4 ${className}`}>
    {children}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mb-1.5 text-[11px] font-bold tracking-wider text-white/60 uppercase og-font-num">
    <span>{children}</span>
    {right && <span className="normal-case tracking-normal font-semibold text-white/50">{right}</span>}
  </div>
);

export const BalanceLine: React.FC<{ balance: number; demo: boolean }> = ({ balance, demo }) => (
  <div className="flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-3 py-2 og-font-num">
    <span className="text-xs font-bold tracking-wider text-white/55">SOLDE{demo && ' DÉMO'}</span>
    <span className="text-lg font-bold text-white">{fmt(balance, 0)}</span>
  </div>
);

/** Saisie de mise : champ libre + ½ / ×2 / min / max */
export const BetInput: React.FC<{
  bet: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  balance: number;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ bet, onChange, min, max, balance, disabled, onClick }) => {
  const [text, setText] = useState(String(bet));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(String(bet));
  }, [bet, focus]);
  const commit = () => {
    const n = Number(text.replace(/\s/g, '').replace(',', '.'));
    onChange(Number.isFinite(n) ? n : bet);
    setFocus(false);
  };
  const btn = 'h-10 min-w-[42px] px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-extrabold og-font-num tracking-wide disabled:opacity-35 disabled:cursor-not-allowed transition-colors';
  const act = (v: number) => {
    onClick?.();
    onChange(v);
  };
  return (
    <div>
      <Label right={`${fmt(min, 0)} – ${fmt(max, 0)}`}>Mise</Label>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <input
            inputMode="numeric"
            value={focus ? text : fmt(bet, 0)}
            disabled={disabled}
            onFocus={() => {
              setFocus(true);
              setText(String(bet));
            }}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Mise"
            className="w-full h-10 rounded-lg bg-black/50 border-2 border-white/10 focus:border-white/40 outline-none pl-3 pr-8 text-white font-bold og-font-num text-base disabled:opacity-60"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">⛁</span>
        </div>
        <button className={btn} disabled={disabled || bet <= min} onClick={() => act(bet / 2)}>
          ½
        </button>
        <button className={btn} disabled={disabled || bet >= max} onClick={() => act(bet * 2)}>
          ×2
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mt-1.5">
        {[
          ['MIN', min],
          ['100', 100],
          ['1 000', 1000],
          ['MAX', Math.max(min, Math.min(max, Math.floor(balance)))],
        ].map(([label, v]) => (
          <button key={label} className={`${btn} h-8`} disabled={disabled} onClick={() => act(Number(v))}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const StatBox: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 min-w-0">
    <div className="text-[10px] font-bold tracking-wider text-white/50 uppercase og-font-num truncate">{label}</div>
    <div className={`og-font-num text-base font-bold truncate ${tone ?? 'text-white'}`}>{value}</div>
  </div>
);

// =============================================================================
// Overlays & modales
// =============================================================================

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`og-pop relative w-full ${wide ? 'max-w-3xl' : 'max-w-sm'} max-h-full overflow-y-auto rounded-xl border-[3px] border-[#140c22] bg-[linear-gradient(180deg,#2e2250,#140c22)] p-5 shadow-2xl`}
      >
        <button onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 text-white/80 hover:text-white">
          <X size={20} />
        </button>
        <h3 className="og-font-title text-2xl tracking-wide text-white text-center mb-4 pr-6">{title}</h3>
        {children}
      </div>
    </div>
  );
};

export const MenuRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 rounded-lg bg-black/30 hover:bg-black/50 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
  >
    {icon}
    {label}
  </button>
);

export const RuleCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-lg bg-black/30 p-3">
    <div className="flex items-center gap-2 mb-1.5">
      <div className="w-8 h-8 shrink-0 rounded-lg bg-white/10 flex items-center justify-center text-white">{icon}</div>
      <b className="text-white og-font-num text-sm tracking-wide">{title}</b>
    </div>
    <p>{children}</p>
  </div>
);

export const HashRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 font-sans font-semibold text-white/50 w-[76px]">{label}</span>
      <span className="flex-1 text-white/85 break-all">{value}</span>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={`Copier ${label}`}
        className="shrink-0 text-white/60 hover:text-white"
      >
        {copied ? <CheckCircle2 size={13} className="text-[#5effa8]" /> : <Copy size={13} />}
      </button>
    </div>
  );
};

/** Grand gain : pluie de jetons et compteur (cliquer pour passer) */
export const BigWinOverlay: React.FC<{ amount: number; mult: number; onClick: () => void; gradient: string; rays: string }> = ({
  amount,
  mult,
  onClick,
  gradient,
  rays,
}) => {
  const label = mult >= 100 ? 'EPIC WIN' : mult >= 25 ? 'MEGA WIN' : 'BIG WIN';
  const rain = useMemo(
    () =>
      Array.from({ length: 24 }, () => ({
        left: Math.random() * 100,
        size: 20 + Math.random() * 22,
        dur: 1.8 + Math.random() * 2,
        delay: Math.random() * 2.5,
      })),
    [],
  );
  return (
    <div onClick={onClick} className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden cursor-pointer bg-[radial-gradient(circle,rgba(40,30,80,0.85),rgba(0,0,0,0.93))]">
      <div className="og-rays absolute left-1/2 top-1/2 w-[160vmax] h-[160vmax] -ml-[80vmax] -mt-[80vmax] pointer-events-none" style={{ background: `repeating-conic-gradient(${rays} 0deg 7deg, transparent 7deg 18deg)` }} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {rain.map((c, i) => (
          <div
            key={i}
            className="og-coin absolute top-0 rounded-full border-[3px] border-[#7a4a06] bg-[radial-gradient(circle_at_35%_30%,#fff6c2,#ffd84a_45%,#c98a0c)] shadow-[inset_0_-3px_0_rgba(0,0,0,0.25)]"
            style={{ left: `${c.left}%`, width: c.size, height: c.size, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, animationIterationCount: 'infinite' }}
          />
        ))}
      </div>
      <div
        key={label}
        className="relative og-pop og-font-title text-[clamp(48px,11vw,130px)] leading-none text-center px-4"
        style={{ background: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextStroke: '3px #140c22', filter: 'drop-shadow(0 7px 0 #140c22)' }}
      >
        {label}
      </div>
      <div className="relative mt-3 og-font-num font-bold text-[clamp(22px,4vw,40px)] text-white drop-shadow-[0_3px_0_#140c22]">{fmtMult(mult)}</div>
      <div className="relative mt-1 og-font-num font-bold text-[clamp(36px,7vw,84px)] text-white drop-shadow-[0_5px_0_#140c22]">{fmt(Math.floor(amount), 0)}</div>
      <div className="relative mt-2 text-white/60 text-xs font-semibold">Cliquez pour passer</div>
    </div>
  );
};

/** Vrai si la touche vient d'un champ de saisie (les cases à cocher et curseurs laissent passer les raccourcis) */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  return !['checkbox', 'radio', 'range', 'button'].includes((el as HTMLInputElement).type);
}

/** SHA-256 hexadécimal (vérification d'équité dans le navigateur) */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Même calcul que public.seed_int52() : 52 premiers bits de sha256(graine:étiquette) */
export async function seedInt52(seed: string, tag: string): Promise<bigint> {
  return BigInt('0x' + (await sha256Hex(`${seed}:${tag}`)).slice(0, 13));
}

/** Graine aléatoire (mode démo) */
export function randomSeed(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
