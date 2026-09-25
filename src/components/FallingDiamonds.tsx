import React, { useEffect, useRef } from 'react';

type Diamond = {
  x: number;
  y: number;
  size: number;
  speed: number;
  spin: number;
  spinSpeed: number;
  tilt: number;
  drift: number;
  depth: number; // 0 = lointain, 1 = proche
  sparkle: number;
};

interface FallingDiamondsProps {
  className?: string;
  /** Multiplicateur du nombre de diamants (1 = défaut) */
  density?: number;
}

/**
 * Pluie de diamants noir & blanc animée en canvas (fond du hero).
 */
export const FallingDiamonds: React.FC<FallingDiamondsProps> = ({ className = '', density = 1 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let running = false;
    let diamonds: Diamond[] = [];

    const spawn = (depth: number, initial: boolean): Diamond => {
      const size = 8 + depth * depth * 40;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : -size * 1.5,
        size,
        speed: 18 + depth * 75,
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (0.4 + Math.random() * 1.1) * (Math.random() < 0.5 ? -1 : 1),
        tilt: (Math.random() - 0.5) * 0.5,
        drift: (Math.random() - 0.5) * 14,
        depth,
        sparkle: 0,
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, (w * h) / 16000) * density);
      // Tri par profondeur : les diamants proches sont dessinés par-dessus
      diamonds = Array.from({ length: count }, () => spawn(Math.random(), true)).sort((a, b) => a.depth - b.depth);
    };

    const drawSparkle = (x: number, y: number, r: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, 'rgba(255,255,255,0.9)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // Étoile à 4 branches
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const k = r * 0.12;
      ctx.moveTo(x, y - r * 1.6);
      ctx.quadraticCurveTo(x + k, y - k, x + r * 1.6, y);
      ctx.quadraticCurveTo(x + k, y + k, x, y + r * 1.6);
      ctx.quadraticCurveTo(x - k, y + k, x - r * 1.6, y);
      ctx.quadraticCurveTo(x - k, y - k, x, y - r * 1.6);
      ctx.fill();
      ctx.restore();
    };

    const drawDiamond = (d: Diamond) => {
      const s = d.size;
      const c = Math.cos(d.spin);
      const face = Math.max(Math.abs(c), 0.08);
      const light = 0.55 + 0.45 * c; // reflet qui varie avec la rotation

      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.tilt);
      ctx.scale(face, 1);
      ctx.globalAlpha = 0.2 + d.depth * 0.7;

      // Taille brillant vue de profil : table, rondiste, colette
      const top = -0.35 * s;
      const girdle = -0.1 * s;
      const culet = 0.6 * s;
      const tw = 0.25 * s;
      const gw = 0.5 * s;

      const body = ctx.createLinearGradient(-gw, top, gw, culet);
      body.addColorStop(0, `rgba(255,255,255,${0.1 + 0.4 * light})`);
      body.addColorStop(0.5, 'rgba(140,140,140,0.12)');
      body.addColorStop(1, `rgba(255,255,255,${0.05 + 0.3 * (1 - light)})`);

      ctx.beginPath();
      ctx.moveTo(-tw, top);
      ctx.lineTo(tw, top);
      ctx.lineTo(gw, girdle);
      ctx.lineTo(0, culet);
      ctx.lineTo(-gw, girdle);
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = 0.8 + d.depth * 0.7;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();

      // Facettes
      ctx.beginPath();
      ctx.moveTo(-gw, girdle);
      ctx.lineTo(gw, girdle);
      ctx.moveTo(-tw, top);
      ctx.lineTo(-tw * 0.4, girdle);
      ctx.lineTo(0, top);
      ctx.lineTo(tw * 0.4, girdle);
      ctx.lineTo(tw, top);
      ctx.moveTo(-tw * 0.4, girdle);
      ctx.lineTo(0, culet);
      ctx.lineTo(tw * 0.4, girdle);
      ctx.moveTo(-gw, girdle);
      ctx.lineTo(0, culet);
      ctx.lineTo(gw, girdle);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();

      if (d.sparkle > 0) {
        drawSparkle(d.x + Math.sin(d.spin) * s * 0.2, d.y + top * 0.6, s * 0.35, d.sparkle * (0.4 + d.depth * 0.6));
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const d of diamonds) {
        d.y += d.speed * dt;
        d.x += d.drift * dt;
        d.spin += d.spinSpeed * dt;
        if (d.sparkle > 0) d.sparkle = Math.max(0, d.sparkle - dt * 2.2);
        else if (Math.random() < dt * 0.12) d.sparkle = 1;
        if (d.y - d.size > h || d.x < -60 || d.x > w + 60) Object.assign(d, spawn(d.depth, false));
        drawDiamond(d);
      }
      if (running) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduceMotion) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    if (reduceMotion) frame(last);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion) frame(performance.now());
    });
    resizeObserver.observe(canvas);

    // Pause quand le hero n'est plus visible
    const intersectionObserver = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    intersectionObserver.observe(canvas);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [density]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none ${className}`} />;
};
