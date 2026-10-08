// Homepage behaviour: the bar that slides away on scroll, the menu that grows out of its pill,
// scroll-linked motion (the pinned product window and everything that grows into view), and the week grid.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ───── Logo: two hands raised in dua, outlined, with lights running round them ─────
// The right hand is described once (fingers, thumb, wrist), tilted outward and mirrored for the left, and the two are
// joined at the palms into one continuous outline. Two "trains" (short lit segments) tick round that line like the
// lights on a train-line map (pathLength 100, stepped animation in CSS).
function handsPath() {
  // Right hand, starting where the palms meet and ending at the wrist's inner corner. "A" draws a rounded tip.
  const steps = [
    ["L", 21.6, 15.6], ["A", 24.2, 15.6], ["L", 24.2, 21], ["L", 24.2, 11.6], ["A", 27, 11.6],
    ["L", 27, 20.8], ["L", 27, 9.8], ["A", 29.8, 9.8], ["L", 29.8, 20.8], ["L", 29.8, 11.2], ["A", 32.6, 11.2],
    ["L", 32.6, 23.5], ["L", 36.2, 17.6], ["A", 38.4, 19], ["L", 34.6, 29.6], ["L", 34, 35], ["L", 22.8, 35],
  ];
  let pts = [[21.6, 26]];
  for (const [kind, x, y] of steps) {
    const [ax, ay] = pts[pts.length - 1];
    if (kind === "L") pts.push([x, y]);
    else {
      // Half circle from the current point to (x, y), bulging outward (clockwise on screen).
      const cx = (ax + x) / 2, cy = (ay + y) / 2, r = Math.hypot(x - ax, y - ay) / 2, a0 = Math.atan2(ay - cy, ax - cx);
      for (let i = 1; i <= 8; i++) pts.push([cx + r * Math.cos(a0 + (Math.PI * i) / 8), cy + r * Math.sin(a0 + (Math.PI * i) / 8)]);
    }
  }
  // Tilt the hand outward a little around the wrist, then mirror it for the left hand and walk back along it.
  const t = (6 * Math.PI) / 180;
  pts = pts.map(([x, y]) => {
    const dx = x - 1 - 28, dy = y - 1.5 - 34;
    return [28 + dx * Math.cos(t) - dy * Math.sin(t), 34 + dx * Math.sin(t) + dy * Math.cos(t)];
  });
  const left = pts.map(([x, y]) => [40 - x, y]).reverse();
  return `M${[...pts, ...left].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;
}
const HANDS = handsPath();

document.querySelectorAll("[data-logo]").forEach((slot, n) => {
  const outline = `<path d="${HANDS}"/>`;
  slot.outerHTML = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
    <defs><filter id="glow-${n}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g class="h-r">${outline}</g><g class="h-c">${outline}</g><g class="h-base">${outline}</g>
    <g class="h-lights" filter="url(#glow-${n})"><path class="light l1" d="${HANDS}" pathLength="100"/><path class="light l2" d="${HANDS}" pathLength="100"/></g>
  </svg>`;
});

// Glitch bursts every few seconds, at slightly random intervals.
if (!reduceMotion) {
  const logos = document.querySelectorAll(".logo");
  (function glitch() {
    setTimeout(() => {
      logos.forEach((l) => l.classList.add("glitch"));
      setTimeout(() => logos.forEach((l) => l.classList.remove("glitch")), 380);
      glitch();
    }, 2600 + Math.random() * 3400);
  })();
}

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
