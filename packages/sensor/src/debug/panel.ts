import { IGNORE_ATTR } from "../probes/artifacts";
import type { Passport, Tier } from "../types";
import { VERSION } from "../version";

// The console's session card: a white sheet ringed by a hairline, ink type, and colour only for who is driving
// (green agents, blue people). System fonts only: the panel runs on other people's sites and loads nothing.
// Light on every page, like the console. On touch screens it is placed from the device's width and height (vw/dvh):
// a page that overflows sideways makes the box that right/bottom measure from bigger than the screen.
const MONO = `ui-monospace,"SF Mono",Menlo,monospace`;
const CSS = `
:host{all:initial!important}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
.c,.pl{position:fixed;right:16px;bottom:16px;z-index:2147483646;color-scheme:light;color:#101215;background:#fff;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;box-shadow:0 0 0 1px #10121514,0 1px 2px #1012150d,0 18px 44px -16px #161e2e29}
@media (hover:none){.c,.pl{right:auto;bottom:auto;left:calc(100vw - 16px);top:calc(100vh - 16px);top:calc(100dvh - 16px);transform:translate(-100%,-100%)}}
.c{width:340px;max-width:calc(100vw - 32px);max-height:min(70vh,600px);display:flex;flex-direction:column;border-radius:16px;overflow:hidden}
.m,.e{font-family:${MONO}}
.e{font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
button:hover{background:#f5f6f8}
button:focus-visible{outline:2px solid #101215;outline-offset:2px}
.h{display:flex;align-items:center;gap:10px;padding:12px 10px 0 18px}
.h .e{flex:1}
.lv{display:flex;align-items:center;gap:6px;font-size:12px;color:#1c7a5e}
.lv i,.dot{flex:none;width:7px;height:7px;border-radius:50%}
.lv i{background:#1c7a5e;box-shadow:0 0 0 3px #1c7a5e26;animation:p 2.4s ease-in-out infinite}
@keyframes p{50%{box-shadow:0 0 0 6px #1c7a5e0a}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.ic{display:grid;place-items:center;width:26px;height:26px;border-radius:8px}
.s{flex:none;padding:12px 18px 16px}
.v{display:flex;align-items:center;gap:10px}
.v b,.pl b{flex:1;font-weight:500}
.v b{font-size:15px;letter-spacing:-.01em}
.n{font-size:14px;font-weight:500}
.dot{box-shadow:inset 0 0 0 1.5px #9298a0}
[data-v=agent] .dot{background:#008300;box-shadow:0 0 0 3px #00830024}
[data-v=human] .dot{background:#2a78d6;box-shadow:0 0 0 3px #2a78d624}
.bar,.sb,.wb{position:relative;display:block;height:6px;border-radius:9px;background:#eceef2}
.bar{margin:12px 0 14px;overflow:hidden}
.bar i,.sb i,.wb i{position:absolute;top:0;bottom:0;border-radius:9px;transition:width .5s cubic-bezier(.2,.8,.2,1)}
[data-v=agent] .bar{background:#e4eee4}
[data-v=agent] .bar i,.pos{background:#008300}
[data-v=human] .bar i,.neg{background:#2a78d6}
.sb:before,.wb:before{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:#10121529}
.kv{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:7px 10px;align-items:baseline}
.kv .m{font-size:12px}
.sb{align-self:center}
.x{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp{grid-column:span 2}
.r{font-size:12px;text-align:right;color:#5e636b}
.e,.k,.q,.d,.em,.ic,.f,.eh,.pl svg{color:#9298a0}
.ev{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;border-top:1px solid #10121514;padding:14px 18px 16px}
.eh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.eh .m{font-size:11px}
ul{list-style:none;display:grid;gap:10px}
li{display:grid;grid-template-columns:minmax(0,1fr) 44px 32px;gap:2px 10px;align-items:start;line-height:19px}
.wb{margin-top:6.5px}
.d{grid-column:1;font-size:11.5px;line-height:1.4;overflow-wrap:anywhere}
.dz{color:#008300;font-weight:500}
.em{display:block}
.f{flex:none;display:flex;align-items:center;gap:6px;padding:9px 10px 9px 18px;border-top:1px solid #10121514;font-size:12px}
.f>span{flex:1}
.f button{height:26px;padding:0 11px;border-radius:99px;box-shadow:inset 0 0 0 1px #10121529;font-weight:500;color:#101215}
.pl{display:flex;align-items:center;gap:9px;height:34px;padding:0 10px 0 15px;border-radius:99px}
.pl svg{transform:rotate(180deg)}
`;

const CHEV = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 5.5 7 9l3.5-3.5"/></svg>`;
const TIER: Record<Tier, string> = { human: "Person", verified: "Verified", recognised: "Recognised product", "unknown-automation": "Unknown automation", unknown: "Undecided" };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const signed = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);
/** A bar growing from the centre: right (green) towards an agent, left (blue) towards a person. */
const fill = (v: number, max: number): string => `${v < 0 ? "right" : "left"}:50%;width:${Math.min(1, Math.abs(v) / max) * 50}%`;

/** Floating debug panel in a shadow root. Only rendered when debug mode is on. */
export class DebugPanel {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private last: Passport | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly label: string | undefined,
    private readonly onExport: () => string,
    private readonly onReset: () => void,
  ) {}

  mount(): void {
    if (typeof document === "undefined" || this.host) return;
    const host = document.createElement("div");
    host.setAttribute(IGNORE_ATTR, "");
    const root = host.attachShadow({ mode: "open" });
    const row = (k: string, f: string, r?: string) =>
      `<span class="k">${k}</span><span class="x${r ? "" : " sp"}" data-f="${f}"></span>${r ? `<span class="m r" data-f="${r}"></span>` : ""}`;
    root.innerHTML = `<style>${CSS}</style><section class="c" aria-label="Observe sensor"><div class="h"><span class="e">Who is driving</span><span class="lv"><i></i>Live</span><button class="ic" data-a="min" title="Collapse" aria-label="Collapse">${CHEV}</button></div><div class="s"><div class="v" role="status" aria-live="polite"><i class="dot"></i><b></b><span class="m n" data-f="sure"></span></div><span class="bar"><i data-f="bar"></i></span><div class="kv">${row("Driver", "driver", "conf")}${row("Tier", "tier")}<span class="k">Score</span><span class="sb"><i data-f="sbar"></i></span><span class="m r" data-f="score"></span>${row("Actions", "actions")}${
      this.label ? `<span class="k">Lab label</span><span class="x sp m">${esc(this.label)}</span>` : ""
    }</div></div><div class="ev"><div class="eh"><span class="e">Evidence</span><span class="m">← person · agent →</span></div><ul></ul></div><div class="f"><span>Observe sensor <span class="m">${VERSION}</span></span><button data-a="copy">Copy JSON</button><button data-a="reset">Reset</button></div></section><button class="pl" data-a="min" hidden aria-label="Expand the Observe sensor panel"><i class="dot"></i><b></b>${CHEV}</button>`;
    root.addEventListener("click", (e) => {
      const btn = (e.target as Element).closest?.("[data-a]") as HTMLElement | null;
      const a = btn?.getAttribute("data-a");
      if (a === "min") {
        const card = root.querySelector(".c") as HTMLElement;
        const pill = root.querySelector(".pl") as HTMLElement;
        card.hidden = !card.hidden;
        pill.hidden = !card.hidden;
        (card.hidden ? pill : (root.querySelector(".ic") as HTMLElement)).focus();
      }
      if (a === "reset") this.onReset();
      if (a === "copy" && btn) {
        const json = this.onExport();
        navigator.clipboard?.writeText(json).then(
          () => {
            btn.textContent = "Copied";
            setTimeout(() => (btn.textContent = "Copy JSON"), 1200);
          },
          () => console.log(json),
        );
      }
    });
    (document.body ?? document.documentElement).appendChild(host);
    this.host = host;
    this.root = root;
    if (this.last) this.render(this.last);
  }

  update(p: Passport): void {
    this.last = p;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.last) this.render(this.last);
    }, 150);
  }

  unmount(): void {
    if (this.timer) clearTimeout(this.timer);
    this.host?.remove();
    this.host = null;
    this.root = null;
  }

  private render(p: Passport): void {
    const root = this.root;
    if (!root) return;
    const f = (n: string) => root.querySelector(`[data-f=${n}]`) as HTMLElement;
    const v = p.verdict;
    const sure = v === "agent" ? p.agentProbability : v === "human" ? 1 - p.agentProbability : 0;
    const word = v === "human" ? "Person" : v === "unknown" ? "Undecided" : p.tier === "unknown-automation" ? "Automation" : "Agent";
    root.querySelectorAll(".c,.pl").forEach((el) => el.setAttribute("data-v", v));
    // Only touch text that changed: the verdict line is a live region and would be read out again.
    const put = (el: Element, t: string) => el.textContent !== t && (el.textContent = t);
    root.querySelectorAll("b").forEach((b) => put(b, word));
    put(f("sure"), v === "unknown" ? "—" : pct(sure));
    f("bar").style.width = pct(sure);

    const d = p.driver;
    const c = p.candidates[0];
    const driver = f("driver");
    const conf = f("conf");
    driver.textContent = d ? d.name : c ? `Leaning ${c.name}` : "—";
    conf.textContent = d ? pct(d.confidence) : c ? c.score.toFixed(1) : "";
    driver.classList.toggle("q", !d);
    conf.classList.toggle("q", !d);
    f("tier").textContent = TIER[p.tier] ?? p.tier;
    const sbar = f("sbar");
    sbar.className = p.score < 0 ? "neg" : "pos";
    sbar.style.cssText = fill(p.score, 9);
    f("score").textContent = signed(p.score);
    f("actions").textContent = `${p.actions}${p.handoffs.length ? ` · ${p.handoffs.length} handoff${p.handoffs.length > 1 ? "s" : ""}` : ""}`;

    const shown = p.reasons.slice(0, 10);
    const max = Math.max(1, ...shown.map((r) => Math.abs(r.weight)));
    (root.querySelector("ul") as HTMLElement).innerHTML =
      shown
        .map(
          (r) =>
            `<li><span>${esc(r.label)}</span><span class="wb"><i class="${r.weight < 0 ? "neg" : "pos"}" style="${fill(r.weight, max)}"></i></span><span class="m r">${signed(r.weight)}</span>${
              r.decisive || r.detail
                ? `<span class="d">${r.decisive ? `<span class="dz">Decisive</span>${r.detail ? " · " : ""}` : ""}${r.detail ? `<span class="m">${esc(r.detail)}</span>` : ""}</span>`
                : ""
            }</li>`,
        )
        .join("") || `<li class="em">No evidence yet. Click, type or scroll.</li>`;
  }
}
