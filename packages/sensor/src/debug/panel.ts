import { IGNORE_ATTR } from "../probes/artifacts";
import type { Passport } from "../types";

const CSS = `
:host{all:initial}
.p{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:340px;max-height:70vh;display:flex;flex-direction:column;
  font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#14213A;background:#fff;border:1px solid #C9D1DE;border-radius:10px;
  box-shadow:0 12px 32px -12px rgba(20,33,58,.35);overflow:hidden}
.h{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #DDE3EC;background:#EEF1F5}
.h b{font-weight:700;flex:1}
button{font:inherit;border:1px solid #C9D1DE;background:#fff;color:inherit;border-radius:6px;padding:2px 7px;cursor:pointer}
.b{padding:10px;overflow:auto;display:grid;gap:8px}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.human{background:#E1F2EC;color:#0E7A63}.agent{background:#EEE7F8;color:#6A3FA3}.unknown{background:#E7EBF1;color:#55617A}
.bar{position:relative;height:10px;border-radius:5px;background:linear-gradient(90deg,#E1F2EC 0 31%,#E7EBF1 31% 69%,#EEE7F8 69%)}
.bar i{position:absolute;top:-3px;width:3px;height:16px;background:#14213A;border-radius:2px}
.row{display:flex;justify-content:space-between;gap:8px}
.k{color:#55617A}
ul{margin:0;padding:0;list-style:none;display:grid;gap:4px}
li{display:grid;grid-template-columns:44px 1fr;gap:6px}
.w{text-align:right;font-weight:700}.pos{color:#6A3FA3}.neg{color:#0E7A63}
.d{color:#55617A;grid-column:2}
.min .b{display:none}
@media (prefers-color-scheme:dark){.p{color:#E3E8F0;background:#151D2C;border-color:#2B364A}.h{background:#0E1420;border-color:#222C3D}
 button{background:#151D2C;border-color:#2B364A}.k,.d{color:#9AA6BA}.human{background:#12302A;color:#3CC6A2}.agent{background:#2A2140;color:#B48CF2}
 .unknown{background:#1D2638;color:#9AA6BA}.bar{background:linear-gradient(90deg,#12302A 0 31%,#1D2638 31% 69%,#2A2140 69%)}.bar i{background:#E3E8F0}
 .pos{color:#B48CF2}.neg{color:#3CC6A2}}
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** Floating debug panel in a shadow root. Only rendered when debug mode is on. */
export class DebugPanel {
  private host: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private wrap: HTMLElement | null = null;
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
    root.innerHTML = `<style>${CSS}</style><div class="p" role="status" aria-live="polite"><div class="h"><b>observe sensor</b>${
      this.label ? `<span class="k">lab: ${esc(this.label)}</span>` : ""
    }<button data-a="copy" title="Copy session JSON">copy</button><button data-a="reset">reset</button><button data-a="min" aria-label="Collapse">–</button></div><div class="b"></div></div>`;
    this.wrap = root.querySelector(".p");
    this.body = root.querySelector(".b");
    root.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).getAttribute?.("data-a");
      if (a === "min") this.wrap?.classList.toggle("min");
      if (a === "reset") this.onReset();
      if (a === "copy") {
        const json = this.onExport();
        navigator.clipboard?.writeText(json).catch(() => console.log(json));
      }
    });
    (document.body ?? document.documentElement).appendChild(host);
    this.host = host;
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
  }

  private render(p: Passport): void {
    if (!this.body) return;
    const pos = Math.max(1, Math.min(99, 50 + (p.score / 9) * 50));
    const driver = p.driver
      ? `${esc(p.driver.name)} <span class="k">(${Math.round(p.driver.confidence * 100)}%)</span>`
      : p.candidates[0]
        ? `<span class="k">leaning ${esc(p.candidates[0].name)} (${p.candidates[0].score})</span>`
        : `<span class="k">—</span>`;
    const reasons = p.reasons
      .slice(0, 10)
      .map(
        (r) =>
          `<li><span class="w ${r.weight > 0 || r.decisive ? "pos" : "neg"}">${r.decisive ? "■" : (r.weight > 0 ? "+" : "") + r.weight}</span><span>${esc(r.label)}</span>${
            r.detail ? `<span class="d">${esc(r.detail)}</span>` : ""
          }</li>`,
      )
      .join("");
    this.body.innerHTML = `
      <div class="row"><span class="pill ${p.verdict}">${p.verdict}</span><span class="k">${esc(p.tier)} · score ${p.score > 0 ? "+" : ""}${p.score}</span></div>
      <div class="bar" aria-hidden="true"><i style="left:calc(${pos}% - 1.5px)"></i></div>
      <div class="row"><span class="k">driver</span><span>${driver}</span></div>
      <div class="row"><span class="k">actions</span><span>${p.actions}${p.handoffs.length ? ` · ${p.handoffs.length} handoff${p.handoffs.length > 1 ? "s" : ""}` : ""}</span></div>
      <ul>${reasons || `<li><span></span><span class="k">No evidence yet. Click, type or scroll.</span></li>`}</ul>`;
  }
}
