// Homepage behaviour: guilloche patterns (the fine line work printed on passports), the week grid,
// the mobile menu, and fade-in on scroll.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVG = "http://www.w3.org/2000/svg";

// ───── Guilloche ─────
// Hypotrochoids and epitrochoids traced with thousands of points, layered like a passport's security print.
(function guilloche() {
  const defs = document.getElementById("patterns");
  if (!defs) return;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  /** Points of a spirograph curve. `inner` traces a hypotrochoid, otherwise an epitrochoid. */
  function trochoid(R, r, d, { inner = true, steps = 4000, scale = 1 } = {}) {
    const turns = r / gcd(R, r);
    const k = inner ? (R - r) / r : (R + r) / r;
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * turns;
      const x = inner ? (R - r) * Math.cos(t) + d * Math.cos(k * t) : (R + r) * Math.cos(t) - d * Math.cos(k * t);
      const y = inner ? (R - r) * Math.sin(t) - d * Math.sin(k * t) : (R + r) * Math.sin(t) - d * Math.sin(k * t);
      out.push(`${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)}`);
    }
    return `M${out.join("L")}`;
  }

  function group(id, layers) {
    const g = document.createElementNS(SVG, "g");
    g.id = id;
    g.setAttribute("fill", "none");
    g.setAttribute("stroke", "currentColor");
    for (const [d, width, opacity] of layers) {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", d);
      p.setAttribute("stroke-width", width);
      p.setAttribute("stroke-opacity", opacity);
      g.appendChild(p);
    }
    defs.appendChild(g);
  }

  group("rosette-a", [
    [trochoid(150, 52, 96, { steps: 6000 }), 0.45, 0.8],
    [trochoid(150, 52, 70, { steps: 6000 }), 0.4, 0.6],
    [trochoid(200, 8, 14, { inner: false, steps: 3200 }), 0.5, 0.7],
    [trochoid(60, 22, 30, { steps: 3000 }), 0.4, 0.7],
  ]);
  group("rosette-b", [
    [trochoid(120, 44, 80, { steps: 4000 }), 0.6, 0.8],
    [trochoid(170, 10, 16, { inner: false, steps: 2400 }), 0.6, 0.7],
  ]);

  // A banknote-style band of interwoven waves for the bottom of the hero.
  const waves = document.createElementNS(SVG, "g");
  waves.id = "waves";
  waves.setAttribute("fill", "none");
  waves.setAttribute("stroke", "currentColor");
  for (let i = 0; i < 26; i++) {
    const pts = [];
    for (let x = 0; x <= 1600; x += 8) {
      const y = 70 + 42 * Math.sin(x * 0.0058 + i * 0.32) * Math.cos(x * 0.0019 - i * 0.11) + (i - 13) * 1.6;
      pts.push(`${x} ${y.toFixed(1)}`);
    }
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", `M${pts.join("L")}`);
    p.setAttribute("stroke-width", "0.8");
    p.setAttribute("vector-effect", "non-scaling-stroke");
    p.setAttribute("stroke-opacity", (0.35 + 0.65 * Math.sin((i / 25) * Math.PI)).toFixed(2));
    waves.appendChild(p);
  }
  defs.appendChild(waves);
})();

// ───── Week grid: one seat's hours, person against agent (illustrative) ─────
(function week() {
  const grid = document.getElementById("week");
  if (!grid) return;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let n = 0;
  days.forEach((day, d) => {
    const weekday = d < 5;
    // The person works 9 to 6 on weekdays with an hour for lunch: 40 hours.
    const person = (h) => weekday && h >= 9 && h < 18 && h !== 12;
    // The agent runs about 20 hours a day, every day: 140 hours.
    const gaps = new Set([(3 + d) % 24, (4 + d) % 24, (14 + 2 * d) % 24, (15 + 2 * d) % 24]);
    const agent = (h) => !gaps.has(h);

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
          cell.style.setProperty("--i", String(n++ % 168));
        }
        lane.appendChild(cell);
      }
      lanes.appendChild(lane);
    }
    row.appendChild(lanes);
    grid.appendChild(row);
  });
})();

// ───── Mobile menu ─────
(function menu() {
  const toggle = document.querySelector(".menu-toggle");
  const panel = document.getElementById("mobile-menu");
  if (!toggle || !panel) return;
  const set = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    set(panel.hidden);
  });
  panel.addEventListener("click", (e) => e.target.closest("a") && set(false));
  document.addEventListener("click", (e) => !panel.hidden && !panel.contains(e.target) && set(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && set(false));
})();

// ───── Fade in on scroll (stamps thump down instead) ─────
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
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
  );
  items.forEach((el) => io.observe(el));
})();
