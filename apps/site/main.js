// Homepage behaviour: the bar that slides away on scroll, the menu that grows out of its pill,
// scroll-linked motion (the pinned product window and everything that grows into view), and the week grid.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ───── Logo: a shirt and tie drawn in points of light ─────
// The drawing is a set of lines on a 100-unit square, sampled into dots. Coloured lights run along the lines like
// trains on a line map; where one passes a vertical line it throws off a glitch: a dotted horizontal streak with a
// flare where it crosses. Every few seconds a burst shifts bands of the drawing sideways and splits it into colour.
const SHIRT = (() => {
  const lines = [];
  const add = (pts, closed = false) => lines.push(closed ? [...pts, pts[0]] : pts);
  const mirror = (pts) => pts.map(([x, y]) => [100 - x, y]);
  // Collar band, the back of the band, and the two collar wings.
  add([[37.5, 16], [37.9, 14.4], [39.3, 13.4], [60.7, 13.4], [62.1, 14.4], [62.5, 16]]);
  add([[40, 16.4], [48.5, 16.4]]);
  const wing = [[37.5, 16], [35.2, 22.8], [41.5, 36.7], [47.8, 28.4]];
  add(wing, true);
  add(mirror(wing), true);
  // The tie: knot, blade and diagonal stripes.
  add([[47.8, 28.4], [52.2, 28.4], [52.6, 35.6], [47.4, 35.6]], true);
  add([[47.4, 35.6], [43.3, 79], [50, 86.7], [56.7, 79], [52.6, 35.6]]);
  const lx = (y) => 47.4 - ((y - 35.6) * 4.1) / 43.4;
  const rx = (y) => 52.6 + ((y - 35.6) * 4.1) / 43.4;
  for (const y of [50, 59.5, 69, 78]) add([[lx(y), y], [rx(y - 7), y - 7]]);
  // Shoulder and sleeve, armhole and side, yoke seam and hem, each mirrored for the right.
  const parts = [
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

// Glitch fragments that stay on the drawing and flicker, as in the reference artwork.
const FRAGMENTS = [
  [[30, 20.6], [39.8, 20.6]], [[59, 20.6], [64.2, 20.6]], [[24, 25.8], [33, 25.8]], [[67, 25.8], [76, 25.8]],
  [[61.5, 13.8], [66, 13.8]], [[20, 56], [20, 61]], [[80.4, 44], [80.4, 48]], [[44, 58], [41, 58]],
];

const WARM = [255, 238, 214];
const LIGHTS = [[89, 225, 255], [255, 95, 207], [255, 197, 90], [141, 255, 138], [169, 139, 255], [255, 120, 92]];
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a.toFixed(3)})`;

/** Dots spaced evenly along each line. Vertical stretches are where glitches can start. */
function sampleLines(lines, gap) {
  const dots = [];
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / gap));
      const vertical = Math.abs(bx - ax) < Math.abs(by - ay) * 0.4;
      for (let k = 0; k < steps; k++) {
        const j = Math.sin((ax + k) * 12.9898 + ay * 78.233) * 0.12;
        dots.push({ x: ax + ((bx - ax) * k) / steps + j, y: ay + ((by - ay) * k) / steps - j, vertical });
      }
    }
    const [x, y] = pts[pts.length - 1];
    dots.push({ x, y, vertical: false });
  }
  return dots;
}

function shirtMark(canvas) {
  const ctx = canvas.getContext("2d");
  const dots = sampleLines(SHIRT, 1.15);
  const frags = sampleLines(FRAGMENTS, 1.15);
  const n = dots.length;
  const TRAIL = 14;
  const pulses = Array.from({ length: 6 }, (_, i) => ({ i: Math.floor((i * n) / 6), color: LIGHTS[i] }));
  let streaks = [];
  let burst = null;
  let nextBurst = performance.now() + 1500;
  let tickMs = 40;
  let lastTick = 0;
  let lastDraw = 0;
  let scale = 1;
  let visible = true;
  let raf = 0;

  function resize() {
    const css = canvas.clientWidth || 62;
    canvas.width = canvas.height = Math.round(css * Math.min(devicePixelRatio || 1, 3));
    scale = canvas.width / 98; // the 100-unit drawing, nearly edge to edge, so the circle frames the whole shirt
  }

  function streak(x, y, color, now) {
    const reach = 6 + Math.random() * 16;
    streaks.push({ x, y, left: reach * (0.25 + Math.random()), right: reach * (0.25 + Math.random()), color, born: now, life: 420 + Math.random() * 1000, size: 1.5 + Math.random() * 1.8 });
  }

  function tick(now) {
    for (const p of pulses) {
      p.i = (p.i + 1) % n;
      const d = dots[p.i];
      if (d.vertical && Math.random() < 0.13) streak(d.x, d.y, p.color, now);
    }
    if (Math.random() < 0.07) {
      const d = dots[Math.floor(Math.random() * n)];
      streak(d.x, d.y, Math.random() < 0.5 ? null : LIGHTS[Math.floor(Math.random() * LIGHTS.length)], now);
    }
    if (now > nextBurst) {
      burst = { until: now + 280, step: 0, bands: [] };
      nextBurst = now + 2200 + Math.random() * 2800;
      for (let k = 0; k < 3; k++) {
        const d = dots[Math.floor(Math.random() * n)];
        streak(d.x, d.y, LIGHTS[Math.floor(Math.random() * LIGHTS.length)], now);
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

  function flare(x, y, size, color, a) {
    let g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    g.addColorStop(0.3, rgba(color, a * 0.85));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    g = ctx.createLinearGradient(x - size * 4.6, y, x + size * 4.6, y);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.5, `rgba(255,255,255,${(a * 0.95).toFixed(3)})`);
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - size * 4.6, y - 0.18, size * 9.2, 0.36);
    g = ctx.createLinearGradient(x, y - size * 1.9, x, y + size * 1.9);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.5, `rgba(255,255,255,${(a * 0.8).toFixed(3)})`);
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - 0.14, y - size * 1.9, 0.28, size * 3.8);
  }

  function draw(now) {
    ctx.setTransform(scale, 0, 0, scale, -1 * scale, -1 * scale);
    ctx.clearRect(1, 1, 98, 98);
    const shift = (y) => {
      if (burst) for (const b of burst.bands) if (y >= b.y0 && y <= b.y1) return b.dx;
      return 0;
    };

    // How lit each dot is: the head of each light is brightest, fading along its trail.
    const lit = new Float32Array(n);
    const hue = new Array(n);
    for (const p of pulses) {
      for (let t = 0; t < TRAIL; t++) {
        const k = (p.i - t + n) % n;
        const v = 1 - t / TRAIL;
        if (v > lit[k]) {
          lit[k] = v;
          hue[k] = p.color;
        }
      }
    }

    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < n; k++) {
      const d = dots[k];
      const v = lit[k];
      const x = d.x + shift(d.y);
      const color = v ? mix(WARM, hue[k], v) : WARM;
      const twinkle = 0.12 * Math.sin(now / 380 + k * 1.7);
      ctx.fillStyle = rgba(color, 0.1 + 0.12 * v);
      ctx.beginPath();
      ctx.arc(x, d.y, 1.15 + 0.6 * v, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(color, Math.min(1, 0.8 + twinkle + 0.2 * v));
      ctx.beginPath();
      ctx.arc(x, d.y, 0.44 + 0.38 * v, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fixed fragments flicker in and out.
    for (let k = 0; k < frags.length; k++) {
      if (Math.sin(now / 170 + k * 2.3) < -0.3) continue;
      const d = frags[k];
      ctx.fillStyle = rgba(WARM, 0.45);
      ctx.beginPath();
      ctx.arc(d.x + shift(d.y), d.y, 0.36, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";
    if (burst) {
      // Colour split: the whole drawing ghosts in magenta to one side and cyan to the other.
      for (const [dx, color] of [[1, [255, 60, 170]], [-1, [60, 200, 255]]]) {
        ctx.fillStyle = rgba(color, 0.35);
        for (const d of dots) {
          ctx.beginPath();
          ctx.arc(d.x + shift(d.y) + dx, d.y, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Heads of the lights get a small flare of their own.
    for (const p of pulses) {
      const d = dots[p.i];
      flare(d.x + shift(d.y), d.y, 1.2, p.color, 0.75);
    }
    // Glitch streaks: dotted lines out to either side, fading as they age, with a flare where they cross.
    streaks = streaks.filter((s) => now - s.born < s.life);
    for (const s of streaks) {
      if (Math.random() < 0.15) continue;
      const f = (now - s.born) / s.life;
      const a = 1 - f;
      const color = s.color || WARM;
      const tint = mix(WARM, color, 0.55);
      const reach = Math.max(s.left, s.right);
      for (let x = -s.left; x <= s.right; x += 1.15) {
        ctx.fillStyle = rgba(tint, a * (0.2 + 0.65 * (1 - Math.abs(x) / reach)));
        ctx.beginPath();
        ctx.arc(s.x + x, s.y, 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
      flare(s.x, s.y, s.size * (1 - f * 0.5), color, a);
    }
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
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
  addEventListener("resize", resize);
  if (reduceMotion) {
    // A still frame: the lights in place and a few glitches frozen.
    const now = performance.now();
    for (let k = 0; k < 5; k++) {
      const d = dots[(k * 97) % n];
      streaks.push({ x: d.x, y: d.y, left: 6, right: 8, color: LIGHTS[k], born: now, life: 1e9, size: 2 });
    }
    draw(now);
    return;
  }
  const logo = canvas.closest(".logo");
  logo?.addEventListener("mouseenter", () => (tickMs = 18));
  logo?.addEventListener("mouseleave", () => (tickMs = 40));
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }).observe(canvas);
}

document.querySelectorAll("[data-logo]").forEach((slot) => {
  const canvas = document.createElement("canvas");
  canvas.className = "mark";
  canvas.setAttribute("aria-hidden", "true");
  slot.replaceWith(canvas);
  shirtMark(canvas);
});

// ───── Menu (phones): the bar opens downward into a panel of links ─────
const nav = document.getElementById("nav");
const menuToggle = document.getElementById("menu-toggle");
const menuPanel = document.getElementById("menu-panel");
const menuLabel = menuToggle.querySelector(".bar-menu-label");
let menuOpen = false;

function setMenu(open) {
  menuOpen = open;
  nav.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuLabel.textContent = open ? "Close" : "Menu";
  menuPanel.setAttribute("aria-hidden", String(!open));
  menuPanel.querySelectorAll("a").forEach((el) => (el.tabIndex = open ? 0 : -1));
  if (open) nav.classList.remove("hidden");
}
menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenu(!menuOpen);
});
menuPanel.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));
document.addEventListener("click", (e) => menuOpen && !menuPanel.contains(e.target) && setMenu(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && menuOpen && setMenu(false));

// ───── Week grid: one seat's hours, person against agent (an example) ─────
(function week() {
  const grid = document.getElementById("week");
  if (!grid) return;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let personHours = 0;
  let agentHours = 0;
  days.forEach((day, d) => {
    const weekday = d < 5;
    // The person works office hours on weekdays, with a break for lunch.
    const person = (h) => weekday && ((h >= 9 && h < 12) || (h >= 13 && h < 17));
    // The agent clears the inbox early, runs reports in the evening, picks up a task or two in the day,
    // and keeps going at the weekend.
    const agent = (h) =>
      weekday ? h === 6 || h === 7 || (h >= 19 && h < 23) || h === (d % 2 ? 15 : 10) : (h >= 8 && h < 12) || (h >= 15 && h < 20);

    const row = document.createElement("div");
    row.className = "day";
    row.innerHTML = `<span>${day}</span>`;
    const lanes = document.createElement("div");
    lanes.className = "lanes";
    for (const [kind, on] of [["person", person], ["agent", agent]]) {
      const lane = document.createElement("div");
      lane.className = `lane ${kind}`;
      for (let h = 0; h < 24; h++) {
        const cell = document.createElement("i");
        if (on(h)) {
          cell.className = "on";
          if (kind === "person") personHours++;
          else agentHours++;
        }
        lane.appendChild(cell);
      }
      lanes.appendChild(lane);
    }
    row.appendChild(lanes);
    grid.appendChild(row);
  });
  document.getElementById("person-hours").textContent = `${personHours} h`;
  document.getElementById("agent-hours").textContent = `${agentHours} h`;
})();

// ───── Scroll: hide the bar going down, show it going up; drive the scroll-linked motion ─────
const scene = document.getElementById("scene");
const sceneWindow = document.getElementById("scene-window");
const sceneDetail = document.getElementById("scene-detail");
const sceneToast = document.getElementById("scene-toast");
const zooms = [...document.querySelectorAll(".zoom")];
let lastY = scrollY;
let ticking = false;

function frame() {
  ticking = false;
  const y = scrollY;
  const vh = innerHeight;

  // The bar: away on the way down, back on the way up, always there near the top.
  const dy = y - lastY;
  if (!menuOpen) {
    if (y < 80 || dy < -4) nav.classList.remove("hidden");
    else if (dy > 4) nav.classList.add("hidden");
  }
  lastY = y;

  if (reduceMotion) return;

  // The pinned scene: the window grows from 74% to full size, then the session detail and the alert appear.
  const pinned = innerWidth > 1100;
  if (pinned) {
    const r = scene.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - vh));
    const grow = easeOut(clamp(p / 0.42));
    sceneWindow.style.transform = `scale(${(0.74 + 0.26 * grow).toFixed(4)})`;
    sceneWindow.style.opacity = clamp(0.06 + p / 0.14).toFixed(3);
    sceneDetail.classList.toggle("show", p > 0.48);
    sceneToast.classList.toggle("show", p > 0.72);
  } else {
    sceneWindow.style.transform = "";
    sceneWindow.style.opacity = "";
  }

  // Everything else grows from small to full size as it rises into view.
  for (const el of zooms) {
    const t = easeOut(clamp((vh - el.getBoundingClientRect().top) / (vh * 0.62)));
    el.style.transform = `scale(${(0.84 + 0.16 * t).toFixed(4)})`;
    el.style.opacity = clamp(0.15 + t * 1.2).toFixed(3);
  }
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
if (reduceMotion) {
  sceneDetail.classList.add("show");
  sceneToast.classList.add("show");
}
frame();
