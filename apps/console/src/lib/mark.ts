/**
 * The logo: a shirt and tie drawn in points of light, ported from the product site (apps/site/main.js).
 *
 * The drawing is a set of lines on a 100-unit square, sampled into dots. Coloured lights run along the lines like
 * trains on a line map; where one passes a vertical line it throws off a glitch: a dotted horizontal streak with a
 * flare where it crosses. Every few seconds a burst shifts bands of the drawing sideways and splits it into colour.
 */

type Pt = [number, number];
type RGB = [number, number, number];

export const SHIRT: Pt[][] = (() => {
  const lines: Pt[][] = [];
  const add = (pts: Pt[], closed = false) => lines.push(closed ? [...pts, pts[0]!] : pts);
  const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [100 - x, y]);
  // Collar band, the back of the band, and the two collar wings.
  add([[37.5, 16], [37.9, 14.4], [39.3, 13.4], [60.7, 13.4], [62.1, 14.4], [62.5, 16]]);
  add([[40, 16.4], [48.5, 16.4]]);
  const wing: Pt[] = [[37.5, 16], [35.2, 22.8], [41.5, 36.7], [47.8, 28.4]];
  add(wing, true);
  add(mirror(wing), true);
  // The tie: knot, blade and diagonal stripes.
  add([[47.8, 28.4], [52.2, 28.4], [52.6, 35.6], [47.4, 35.6]], true);
  add([[47.4, 35.6], [43.3, 79], [50, 86.7], [56.7, 79], [52.6, 35.6]]);
  const lx = (y: number) => 47.4 - ((y - 35.6) * 4.1) / 43.4;
  const rx = (y: number) => 52.6 + ((y - 35.6) * 4.1) / 43.4;
  for (const y of [50, 59.5, 69, 78]) add([[lx(y), y], [rx(y - 7), y - 7]]);
  // Shoulder and sleeve, armhole and side, yoke seam and hem, each mirrored for the right.
  const parts: Pt[][] = [
    [[35.2, 22.8], [30, 25.2], [24.6, 27.8], [21.4, 30.6], [19.4, 33.6], [18.3, 36.8], [18, 40], [18, 80.5]],
    [[20.4, 35.4], [27.6, 46.4], [27.6, 82.6]],
    [[23.9, 30.3], [35.1, 27.5]],
    [[21, 82.6], [39, 82.6]],
  ];
  for (const part of parts) {
    add(part);
    add(mirror(part));
  }
  // Chest pocket and flap.
  add([[60.6, 46.6], [71, 46.6], [71, 60.6], [65.8, 63.2], [60.6, 60.6]], true);
  add([[60.6, 50.6], [71, 50.6]]);
  return lines;
})();

/** Glitch fragments that stay on the drawing and flicker, as in the reference artwork. */
export const FRAGMENTS: Pt[][] = [
  [[30, 20.6], [39.8, 20.6]], [[59, 20.6], [64.2, 20.6]], [[24, 25.8], [33, 25.8]], [[67, 25.8], [76, 25.8]],
  [[61.5, 13.8], [66, 13.8]], [[20, 56], [20, 61]], [[80.4, 44], [80.4, 48]], [[44, 58], [41, 58]],
];

const WARM: RGB = [255, 238, 214];
const LIGHTS: RGB[] = [[89, 225, 255], [255, 95, 207], [255, 197, 90], [141, 255, 138], [169, 139, 255], [255, 120, 92]];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`;
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

interface Dot {
  x: number;
  y: number;
  vertical: boolean;
}

/** Dots spaced evenly along each line. Vertical stretches are where glitches can start. */
export function sampleLines(lines: Pt[][], gap: number): Dot[] {
  const dots: Dot[] = [];
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / gap));
      const vertical = Math.abs(bx - ax) < Math.abs(by - ay) * 0.4;
      for (let k = 0; k < steps; k++) {
        const j = Math.sin((ax + k) * 12.9898 + ay * 78.233) * 0.12;
        dots.push({ x: ax + ((bx - ax) * k) / steps + j, y: ay + ((by - ay) * k) / steps - j, vertical });
      }
    }
    const [x, y] = pts[pts.length - 1]!;
    dots.push({ x, y, vertical: false });
  }
  return dots;
}

interface Streak {
  x: number;
  y: number;
  left: number;
  right: number;
  color: RGB | null;
  born: number;
  life: number;
  size: number;
}

/**
 * Draws the mark on a canvas and keeps it moving while it is on screen. With reduced motion it draws one still
 * frame. Returns a function that stops everything.
 */
export function shirtMark(canvas: HTMLCanvasElement, { reduceMotion, hover }: { reduceMotion: boolean; hover?: HTMLElement | null }): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dots = sampleLines(SHIRT, 1.15);
  const frags = sampleLines(FRAGMENTS, 1.15);
  const n = dots.length;
  const TRAIL = 14;
  const pulses = Array.from({ length: 6 }, (_, i) => ({ i: Math.floor((i * n) / 6), color: LIGHTS[i]! }));
  let streaks: Streak[] = [];
  let burst: { until: number; step: number; bands: { y0: number; y1: number; dx: number }[] } | null = null;
  let nextBurst = performance.now() + 1500;
  let tickMs = 40;
  let lastTick = 0;
  let lastDraw = 0;
  let scale = 1;
  let visible = true;
  let raf = 0;
  let stopped = false;

  function resize() {
    const css = canvas.clientWidth || 40;
    const px = Math.round(css * Math.min(window.devicePixelRatio || 1, 3));
    // Setting the size clears the canvas, so only do it when it actually changes.
    if (canvas.width !== px) canvas.width = canvas.height = px;
    scale = canvas.width / 98; // the 100-unit drawing, nearly edge to edge, so the circle frames the whole shirt
  }

  function streak(x: number, y: number, color: RGB | null, now: number) {
    const reach = 6 + Math.random() * 16;
    streaks.push({ x, y, left: reach * (0.25 + Math.random()), right: reach * (0.25 + Math.random()), color, born: now, life: 420 + Math.random() * 1000, size: 1.5 + Math.random() * 1.8 });
  }

  function tick(now: number) {
    for (const p of pulses) {
      p.i = (p.i + 1) % n;
      const d = dots[p.i]!;
      if (d.vertical && Math.random() < 0.13) streak(d.x, d.y, p.color, now);
    }
    if (Math.random() < 0.07) {
      const d = pick(dots);
      streak(d.x, d.y, Math.random() < 0.5 ? null : pick(LIGHTS), now);
    }
    if (now > nextBurst) {
      burst = { until: now + 280, step: 0, bands: [] };
      nextBurst = now + 2200 + Math.random() * 2800;
      for (let k = 0; k < 3; k++) {
        const d = pick(dots);
        streak(d.x, d.y, pick(LIGHTS), now);
      }
    }
    if (burst) {
      if (now > burst.until) burst = null;
      else if (now - burst.step > 60) {
        // New band offsets every few frames, so the slip jumps rather than slides.
        burst.step = now;
        burst.bands = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => {
          const y0 = 12 + Math.random() * 70;
          return { y0, y1: y0 + 2 + Math.random() * 9, dx: (Math.random() - 0.5) * 7 };
        });
      }
    }
  }

  function flare(x: number, y: number, size: number, color: RGB, a: number) {
    let g = ctx!.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    g.addColorStop(0.3, rgba(color, a * 0.85));
    g.addColorStop(1, rgba(color, 0));
    ctx!.fillStyle = g;
    ctx!.beginPath();
    ctx!.arc(x, y, size, 0, Math.PI * 2);
    ctx!.fill();
    g = ctx!.createLinearGradient(x - size * 4.6, y, x + size * 4.6, y);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.5, `rgba(255,255,255,${(a * 0.95).toFixed(3)})`);
    g.addColorStop(1, rgba(color, 0));
    ctx!.fillStyle = g;
    ctx!.fillRect(x - size * 4.6, y - 0.18, size * 9.2, 0.36);
    g = ctx!.createLinearGradient(x, y - size * 1.9, x, y + size * 1.9);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.5, `rgba(255,255,255,${(a * 0.8).toFixed(3)})`);
    g.addColorStop(1, rgba(color, 0));
    ctx!.fillStyle = g;
    ctx!.fillRect(x - 0.14, y - size * 1.9, 0.28, size * 3.8);
  }

  function draw(now: number) {
    const c = ctx!;
    c.setTransform(scale, 0, 0, scale, -1 * scale, -1 * scale);
    c.clearRect(1, 1, 98, 98);
    const shift = (y: number) => {
      if (burst) for (const b of burst.bands) if (y >= b.y0 && y <= b.y1) return b.dx;
      return 0;
    };

    // How lit each dot is: the head of each light is brightest, fading along its trail.
    const lit = new Float32Array(n);
    const hue: (RGB | undefined)[] = new Array(n);
    for (const p of pulses) {
      for (let t = 0; t < TRAIL; t++) {
        const k = (p.i - t + n) % n;
        const v = 1 - t / TRAIL;
        if (v > lit[k]!) {
          lit[k] = v;
          hue[k] = p.color;
        }
      }
    }

    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < n; k++) {
      const d = dots[k]!;
      const v = lit[k]!;
      const x = d.x + shift(d.y);
      const color = v ? mix(WARM, hue[k]!, v) : WARM;
      const twinkle = 0.12 * Math.sin(now / 380 + k * 1.7);
      c.fillStyle = rgba(color, 0.1 + 0.12 * v);
      c.beginPath();
      c.arc(x, d.y, 1.15 + 0.6 * v, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = rgba(color, Math.min(1, 0.8 + twinkle + 0.2 * v));
      c.beginPath();
      c.arc(x, d.y, 0.44 + 0.38 * v, 0, Math.PI * 2);
      c.fill();
    }
    // Fixed fragments flicker in and out.
    for (let k = 0; k < frags.length; k++) {
      if (Math.sin(now / 170 + k * 2.3) < -0.3) continue;
      const d = frags[k]!;
      c.fillStyle = rgba(WARM, 0.45);
      c.beginPath();
      c.arc(d.x + shift(d.y), d.y, 0.36, 0, Math.PI * 2);
      c.fill();
    }

    if (burst) {
      // Colour split: the whole drawing ghosts in magenta to one side and cyan to the other.
      for (const [dx, color] of [[1, [255, 60, 170]], [-1, [60, 200, 255]]] as [number, RGB][]) {
        c.fillStyle = rgba(color, 0.35);
        for (const d of dots) {
          c.beginPath();
          c.arc(d.x + shift(d.y) + dx, d.y, 0.4, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // Heads of the lights get a small flare of their own.
    for (const p of pulses) {
      const d = dots[p.i]!;
      flare(d.x + shift(d.y), d.y, 1.2, p.color, 0.75);
    }
    // Glitch streaks: dotted lines out to either side, fading as they age, with a flare where they cross.
    streaks = streaks.filter((s) => now - s.born < s.life);
    for (const s of streaks) {
      if (Math.random() < 0.15) continue;
      const f = (now - s.born) / s.life;
      const a = 1 - f;
      const color = s.color ?? WARM;
      const tint = mix(WARM, color, 0.55);
      const reach = Math.max(s.left, s.right);
      for (let x = -s.left; x <= s.right; x += 1.15) {
        c.fillStyle = rgba(tint, a * (0.2 + 0.65 * (1 - Math.abs(x) / reach)));
        c.beginPath();
        c.arc(s.x + x, s.y, 0.36, 0, Math.PI * 2);
        c.fill();
      }
      flare(s.x, s.y, s.size * (1 - f * 0.5), color, a);
    }
  }

  function frame(now: number) {
    raf = 0;
    if (!visible || stopped) return;
    if (now - lastTick > tickMs) {
      tick(now);
      lastTick = now;
    }
    if (now - lastDraw > 30) {
      draw(now);
      lastDraw = now;
    }
    raf = requestAnimationFrame(frame);
  }

  resize();

  if (reduceMotion) {
    // A still frame: the lights in place and a few glitches frozen.
    const still = () => {
      resize();
      const now = performance.now();
      streaks = [];
      for (let k = 0; k < 5; k++) {
        const d = dots[(k * 97) % n]!;
        streaks.push({ x: d.x, y: d.y, left: 6, right: 8, color: LIGHTS[k]!, born: now, life: 1e9, size: 2 });
      }
      draw(now);
    };
    still();
    window.addEventListener("resize", still);
    return () => window.removeEventListener("resize", still);
  }

  const onResize = () => resize();
  const fast = () => (tickMs = 18);
  const slow = () => (tickMs = 40);
  window.addEventListener("resize", onResize);
  hover?.addEventListener("mouseenter", fast);
  hover?.addEventListener("mouseleave", slow);
  // Only animate while the mark is on screen (a hidden sidebar, or a phone's collapsed header, stops it).
  const io = new IntersectionObserver(([e]) => {
    visible = Boolean(e?.isIntersecting);
    if (visible && !raf) raf = requestAnimationFrame(frame);
  });
  io.observe(canvas);

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener("resize", onResize);
    hover?.removeEventListener("mouseenter", fast);
    hover?.removeEventListener("mouseleave", slow);
  };
}
