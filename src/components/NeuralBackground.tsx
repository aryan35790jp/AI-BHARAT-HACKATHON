import React, { useEffect, useRef } from 'react';

/* ══════════════════════════════════════════════════════════
   NeuralBackground — living knowledge-network canvas
   ══════════════════════════════════════════════════════════ */

/* ─── Tuning ─── */
const NODE_COUNT      = 68;       // 50-80 sweet spot
const CONNECT_DIST    = 120;      // px — max link distance
const MOUSE_RADIUS    = 170;      // px — interaction zone
const PULSE_CHANCE    = 0.0018;   // per-frame per-connection
const EDGE_MARGIN     = 40;       // soft-bounce buffer zone
const WOBBLE_STRENGTH = 0.12;     // organic sine-wave drift
const MAX_PULSES      = 30;       // cap to keep GC calm

const COLORS = [
  '#6C63FF', // violet
  '#00E5FF', // cyan
  '#FF7AF6', // pink
  '#00FFA6', // mint
  '#FFD166', // soft gold
];

/* Layer presets  — [speedMultiplier, sizeMin, sizeMax, glowMul, opacity] */
const LAYERS: [number, number, number, number, number][] = [
  [0.10, 4.0, 5.0, 4.0, 0.45],  // Layer 0 — far / slow  / dim
  [0.18, 4.5, 6.0, 3.5, 0.70],  // Layer 1 — mid
  [0.28, 5.0, 7.0, 3.0, 0.90],  // Layer 2 — near / faster / bright
];

/* ─── Types ─── */
interface NetNode {
  x: number;  y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  layer: number;
  /** per-node phase offset for sine wobble */
  phase: number;
  /** pre-computed rgba triplet */
  rgb: [number, number, number];
  opacity: number;
  glowR: number;
}

interface Pulse {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  rgb: [number, number, number];
}

/* ─── Helpers ─── */
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgba(c: [number, number, number], a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Generate a 1-pixel noise ImageData that can be drawn tiled */
function createNoisePattern(ctx: CanvasRenderingContext2D, w: number, h: number): ImageData {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = v; d[i + 1] = v; d[i + 2] = v;
    d[i + 3] = 8; // very subtle
  }
  return img;
}

/* ═══════════════════════ Component ═══════════════════════ */
export const NeuralBackground: React.FC = () => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const mouseRef   = useRef({ x: -9999, y: -9999 });
  const nodesRef   = useRef<NetNode[]>([]);
  const pulsesRef  = useRef<Pulse[]>([]);
  const rafRef     = useRef(0);
  const frameRef   = useRef(0);      // global frame counter
  const noiseRef   = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    /* ── Resize ── */
    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Regenerate noise pattern at new size (capped for perf)
      const nw = Math.min(W, 512);
      const nh = Math.min(H, 512);
      noiseRef.current = createNoisePattern(ctx, nw, nh);
    };
    resize();
    window.addEventListener('resize', resize);

    /* ── Initialize nodes ── */
    nodesRef.current = Array.from({ length: NODE_COUNT }, () => {
      const layer = Math.floor(Math.random() * 3);
      const [speed, sMin, sMax, glowMul, opacity] = LAYERS[layer];
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const r = sMin + Math.random() * (sMax - sMin);
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        r,
        color,
        layer,
        phase: Math.random() * Math.PI * 2,
        rgb: hexToRgb(color),
        opacity,
        glowR: r * glowMul,
      };
    });

    /* ── Mouse tracking (throttled via rAF) ── */
    let pendingMouse = { x: -9999, y: -9999 };
    const handleMouse = (e: MouseEvent) => {
      pendingMouse = { x: e.clientX, y: e.clientY };
    };
    const handleMouseLeave = () => {
      pendingMouse = { x: -9999, y: -9999 };
    };
    window.addEventListener('mousemove', handleMouse, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    /* ── Clear frame (transparent — gradient lives on wrapper div) ── */
    const drawBg = () => {
      ctx.clearRect(0, 0, W, H);

      // Subtle noise overlay
      if (noiseRef.current) {
        ctx.putImageData(noiseRef.current, 0, 0);
      }
    };

    /* ═══════════════ RENDER LOOP ═══════════════ */
    const animate = () => {
      frameRef.current++;
      const frame = frameRef.current;

      // Sync mouse position once per frame (throttle)
      mouseRef.current = pendingMouse;
      const mouse = mouseRef.current;

      const nodes  = nodesRef.current;
      const pulses = pulsesRef.current;

      /* ── Clear + background ── */
      drawBg();

      const time = frame * 0.01; // slow time unit for wobble

      /* ── Update nodes ── */
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        // Organic sine wobble
        n.x += n.vx + Math.sin(time + n.phase)       * WOBBLE_STRENGTH * 0.5;
        n.y += n.vy + Math.cos(time + n.phase + 1.5)  * WOBBLE_STRENGTH * 0.5;

        // Soft bounce — dampen velocity near edges instead of hard flip
        if (n.x < EDGE_MARGIN)       { n.vx += 0.003; n.x = Math.max(0, n.x); }
        if (n.x > W - EDGE_MARGIN)   { n.vx -= 0.003; n.x = Math.min(W, n.x); }
        if (n.y < EDGE_MARGIN)       { n.vy += 0.003; n.y = Math.max(0, n.y); }
        if (n.y > H - EDGE_MARGIN)   { n.vy -= 0.003; n.y = Math.min(H, n.y); }

        // Cap speed so nodes don't fly off
        const spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        const maxSpd = LAYERS[n.layer][0] * 1.4;
        if (spd > maxSpd) {
          n.vx *= maxSpd / spd;
          n.vy *= maxSpd / spd;
        }

        // Mouse interaction — gentle attraction
        const mdx = mouse.x - n.x;
        const mdy = mouse.y - n.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mDist < MOUSE_RADIUS && mDist > 1) {
          const force = (1 - mDist / MOUSE_RADIUS) * 0.012;
          n.x += mdx * force;
          n.y += mdy * force;
        }
      }

      /* ── Draw connections ── */
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > CONNECT_DIST * CONNECT_DIST) continue;

          const dist = Math.sqrt(distSq);
          const t = 1 - dist / CONNECT_DIST;           // 0→1 closeness
          let alpha = t * 0.18;

          // Brighten if midpoint near cursor
          const mx = (a.x + b.x) * 0.5;
          const my = (a.y + b.y) * 0.5;
          const mDistSq = (mouse.x - mx) ** 2 + (mouse.y - my) ** 2;
          if (mDistSq < MOUSE_RADIUS * MOUSE_RADIUS) {
            alpha += (1 - Math.sqrt(mDistSq) / MOUSE_RADIUS) * 0.14;
          }

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(120,160,255,${alpha})`;
          ctx.stroke();

          // Maybe spawn a pulse
          if (pulses.length < MAX_PULSES && Math.random() < PULSE_CHANCE) {
            pulses.push({
              fromIdx: i,
              toIdx: j,
              progress: 0,
              speed: 0.006 + Math.random() * 0.012,
              rgb: a.rgb,
            });
          }
        }
      }

      /* ── Draw & update pulses ── */
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pulse = pulses[p];
        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) { pulses.splice(p, 1); continue; }

        const from = nodes[pulse.fromIdx];
        const to   = nodes[pulse.toIdx];
        const px   = from.x + (to.x - from.x) * pulse.progress;
        const py   = from.y + (to.y - from.y) * pulse.progress;
        const a    = Math.sin(pulse.progress * Math.PI);  // 0→1→0

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = rgba(pulse.rgb, a * 0.18);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(pulse.rgb, a * 0.85);
        ctx.fill();
      }

      /* ── Draw nodes (back-to-front by layer) ── */
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.layer !== layer) continue;

          // Pulsing glow radius
          const breathe = 1 + Math.sin(time * 1.2 + n.phase) * 0.12;

          // Outer glow
          const grad = ctx.createRadialGradient(
            n.x, n.y, 0,
            n.x, n.y, n.glowR * breathe,
          );
          grad.addColorStop(0, rgba(n.rgb, 0.22 * n.opacity));
          grad.addColorStop(0.5, rgba(n.rgb, 0.06 * n.opacity));
          grad.addColorStop(1, rgba(n.rgb, 0));
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.glowR * breathe, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          // Core
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fillStyle = rgba(n.rgb, 0.85 * n.opacity);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: -1,
        background: 'linear-gradient(to bottom, #0B0F1A, #020617)',
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ background: 'transparent' }}
      />
    </div>
  );
};
