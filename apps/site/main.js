// Homepage behaviour: the drifting dot "sand" behind the page, the menu, and fade-in on scroll.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ───── Sand: two bands of fine dotted strands, blue low on the left and warm high on the right ─────
(function sand() {
  const canvas = document.getElementById("sand");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // A seeded random so the pattern is the same on every load.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Each band follows a cubic curve (in fractions of the viewport) and spreads across `width` in parallel strands.
  const BANDS = [
    { color: [58, 92, 196], points: [[-0.12, 1.02], [0.18, 0.98], [0.32, 0.6], [0.66, 0.46]], width: 0.13, count: 12000, alpha: 0.78 },
    { color: [214, 116, 82], points: [[0.46, 0.66], [0.6, 0.36], [0.86, 0.3], [1.12, 0.2]], width: 0.12, count: 10000, alpha: 0.62 },
  ];
  const STRANDS = 46;

  const bez = (p, t, i) => {
    const m = 1 - t;
    return m * m * m * p[0][i] + 3 * m * m * t * p[1][i] + 3 * m * t * t * p[2][i] + t * t * t * p[3][i];
  };
  const dbez = (p, t, i) => {
    const m = 1 - t;
    return 3 * m * m * (p[1][i] - p[0][i]) + 6 * m * t * (p[2][i] - p[1][i]) + 3 * t * t * (p[3][i] - p[2][i]);
  };

  const particles = BANDS.map((b) =>
    Array.from({ length: b.count }, () => {
      const k = Math.floor(rand() * STRANDS);
      return { u: rand(), k, v: (k / (STRANDS - 1) - 0.5) * 2 + (rand() - 0.5) * 0.03, a: 0.35 + rand() * 0.65, s: rand() < 0.12 ? 1.6 : 1.1 };
    }),
  );

  let w = 0;
  let h = 0;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    // Softer on narrow screens, where the bands sit behind more of the text.
    const soften = w < 700 ? 0.6 : 1;
    BANDS.forEach((b, bi) => {
      const [r, g, bl] = b.color;
      const width = b.width * h;
      for (const p of particles[bi]) {
        const x0 = bez(b.points, p.u, 0) * w;
        const y0 = bez(b.points, p.u, 1) * h;
        const dx = dbez(b.points, p.u, 0) * w;
        const dy = dbez(b.points, p.u, 1) * h;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        // Strands ripple slowly along the band.
        const ripple = Math.sin(p.u * 11 + t * 0.00045 + p.k * 0.23) * width * 0.09;
        const off = p.v * width + ripple;
        const fade = Math.pow(Math.sin(Math.PI * p.u), 0.9) * (1 - p.v * p.v);
        const alpha = b.alpha * fade * p.a * soften;
        if (alpha < 0.02) continue;
        ctx.fillStyle = `rgba(${r},${g},${bl},${alpha.toFixed(3)})`;
        ctx.fillRect(x0 + nx * off, y0 + ny * off, p.s, p.s);
      }
    });
  }

  resize();
  addEventListener("resize", () => {
    resize();
    if (reduceMotion) draw(0);
  });
  if (reduceMotion) return draw(0);

  // About 30 frames a second is plenty for a slow drift and keeps the page light.
  let last = 0;
  (function frame(t) {
    if (t - last > 33) {
      draw(t);
      last = t;
    }
    requestAnimationFrame(frame);
  })(0);
})();

// ───── Menu ─────
(function menu() {
  const toggle = document.querySelector(".nav-toggle");
  const panel = document.getElementById("menu");
  if (!toggle || !panel) return;
  const set = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    set(panel.hidden);
  });
  panel.addEventListener("click", (e) => {
    if (e.target.closest("a")) set(false);
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target)) set(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") set(false);
  });
})();

// ───── Fade in on scroll ─────
(function reveal() {
  const items = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  items.forEach((el) => io.observe(el));
})();
