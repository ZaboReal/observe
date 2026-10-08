// Homepage behaviour: the bar that slides away on scroll, the menu that grows out of its pill,
// scroll-linked motion (the pinned product window and everything that grows into view), and the week grid.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ───── Menu: the pill expands into a panel ─────
const nav = document.getElementById("nav");
const menuToggle = document.getElementById("menu-toggle");
const menuPanel = document.getElementById("menu-panel");
const menuClose = document.getElementById("menu-close");
let menuOpen = false;

function setMenu(open) {
  menuOpen = open;
  nav.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuPanel.setAttribute("aria-hidden", String(!open));
  menuPanel.querySelectorAll("a, button").forEach((el) => (el.tabIndex = open ? 0 : -1));
  if (open) {
    nav.classList.remove("hidden");
    menuClose.focus({ preventScroll: true });
  }
}
menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenu(true);
});
menuClose.addEventListener("click", () => {
  setMenu(false);
  menuToggle.focus({ preventScroll: true });
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
