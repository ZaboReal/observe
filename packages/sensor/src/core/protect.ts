import type { ProtectRule } from "../types";
import { bypass } from "./transport";

/** Header that carries the collector token on protected `fetch` and `XMLHttpRequest` calls. */
export const TOKEN_HEADER = "x-observe-token";
/** Hidden input that carries the collector token on protected form posts. */
export const TOKEN_FIELD = "observe_token";

export interface GuardHooks {
  /** Record the action, flush, and resolve with a token (or `null`). */
  protectAsync(action: string): Promise<{ token: string | null }>;
  /** Record the action and start a flush without waiting; returns the token held right now. For forms and sync XHR. */
  protectNow(action: string): string | null;
}

/**
 * Match a URL path against a rule path. Segments compare exactly; a `*` segment matches one non-empty segment;
 * a trailing `*` matches the rest of the path (at least one character).
 */
export function matchPath(pattern: string, path: string): boolean {
  const want = pattern.split("/");
  const got = path.split("/");
  for (let i = 0; i < want.length; i++) {
    const seg = want[i];
    if (seg === "*" && i === want.length - 1) return got.slice(i).join("/") !== "";
    if (i >= got.length) return false;
    if (seg === "*" ? got[i] === "" : seg !== got[i]) return false;
  }
  return want.length === got.length;
}

/** Keep well-formed rules only (the script-tag config arrives as untyped JSON). */
export function normaliseRules(rules: unknown): ProtectRule[] {
  if (!Array.isArray(rules)) return [];
  const out: ProtectRule[] = [];
  for (const r of rules as Partial<ProtectRule>[]) {
    if (!r || typeof r.path !== "string" || !r.path || typeof r.action !== "string" || !r.action) continue;
    out.push({ path: r.path, method: typeof r.method === "string" && r.method ? r.method : undefined, action: r.action });
  }
  return out;
}

/** The first rule matching a same-origin http(s) request, or `null`. */
export function findRule(rules: readonly ProtectRule[], method: string, url: string): ProtectRule | null {
  if (!rules.length) return null;
  const u = new URL(url, document.baseURI || location.href);
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.origin !== location.origin) return null;
  const m = method.toUpperCase();
  for (const r of rules) {
    const rm = (r.method || "POST").toUpperCase();
    if ((rm === "*" || rm === m) && matchPath(r.path, u.pathname)) return r;
  }
  return null;
}

type Fetch = typeof fetch;
type Xhr = XMLHttpRequest;
interface XhrState {
  method: string;
  url: string;
  async: boolean;
  /** Set when `abort()` or a new `open()` arrives while a protected send is waiting for its token. */
  cancelled: boolean;
}

/**
 * Wraps `fetch`, `XMLHttpRequest.prototype.open/send/abort` and listens for form submissions so matching same-origin
 * requests carry the collector token. Cross-origin requests and non-matching ones go through untouched; bodies are
 * never read; any error falls back to the original request as the page made it.
 */
export class RequestGuard {
  private active = false;
  /** Restores the originals, newest last. */
  private undo: (() => void)[] = [];
  private xhrState = new WeakMap<Xhr, XhrState>();
  private inputs = new Set<HTMLInputElement>();
  private onSubmit = (e: Event) => this.submit(e);

  constructor(
    private readonly rules: readonly ProtectRule[],
    private readonly hooks: GuardHooks,
  ) {}

  install(): void {
    if (this.active || !this.rules.length || typeof window === "undefined") return;
    this.active = true;
    this.wrapFetch();
    this.wrapXhr();
    window.addEventListener("submit", this.onSubmit, true);
  }

  /** Restore the originals. If other code wrapped them after us, leave its wrapper in place; ours passes through. */
  uninstall(): void {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener("submit", this.onSubmit, true);
    for (const restore of this.undo.splice(0)) {
      try {
        restore();
      } catch {
        /* read-only after all */
      }
    }
    for (const input of this.inputs) input.remove();
    this.inputs.clear();
  }

  private match(method: string, url: string): ProtectRule | null {
    if (!this.active || bypass.depth) return null;
    try {
      return findRule(this.rules, method, url);
    } catch {
      return null;
    }
  }

  private wrapFetch(): void {
    const original = window.fetch;
    if (typeof original !== "function") return;
    const self = this;
    const wrapped = function (this: unknown, ...args: Parameters<Fetch>): Promise<Response> {
      let rule: ProtectRule | null = null;
      try {
        const [input, init] = args;
        const req = typeof Request !== "undefined" && input instanceof Request ? input : null;
        rule = self.match((init && init.method) || (req ? req.method : "GET"), req ? req.url : String(input));
      } catch {
        rule = null;
      }
      if (!rule) return original.apply(this, args);
      const that = this;
      return self.hooks.protectAsync(rule.action).then(
        ({ token }) => {
          let next = args;
          if (token) {
            try {
              next = withHeader(args, token);
            } catch {
              next = args;
            }
          }
          return original.apply(that, next);
        },
        () => original.apply(that, args),
      );
    } as Fetch;
    try {
      window.fetch = wrapped;
      this.undo.push(() => {
        if (window.fetch === wrapped) window.fetch = original;
      });
    } catch {
      /* read-only fetch */
    }
  }

  private wrapXhr(): void {
    if (typeof XMLHttpRequest === "undefined") return;
    const proto = XMLHttpRequest.prototype;
    const orig = { open: proto.open, send: proto.send, abort: proto.abort };
    if (typeof orig.open !== "function" || typeof orig.send !== "function" || typeof orig.abort !== "function") return;
    const self = this;
    const states = this.xhrState;

    const open = function (this: Xhr, ...args: unknown[]) {
      try {
        const prev = states.get(this);
        if (prev) prev.cancelled = true;
        const url = new URL(String(args[1]), document.baseURI || location.href).href;
        states.set(this, { method: String(args[0]), url, async: args.length < 3 || Boolean(args[2]), cancelled: false });
      } catch {
        states.delete(this);
      }
      return (orig.open as (...a: unknown[]) => void).apply(this, args);
    } as Xhr["open"];

    const send = function (this: Xhr, ...args: Parameters<Xhr["send"]>) {
      const state = states.get(this);
      const rule = state ? self.match(state.method, state.url) : null;
      if (!rule || !state) return orig.send.apply(this, args);
      const xhr = this;
      if (!state.async) {
        // A synchronous request can't wait: it carries the token held right now.
        try {
          const token = self.hooks.protectNow(rule.action);
          if (token) xhr.setRequestHeader(TOKEN_HEADER, token);
        } catch {
          /* send as the page made it */
        }
        return orig.send.apply(xhr, args);
      }
      const go = (token: string | null) => {
        if (state.cancelled || states.get(xhr) !== state) return;
        if (token) {
          try {
            xhr.setRequestHeader(TOKEN_HEADER, token);
          } catch {
            /* send without it */
          }
        }
        try {
          orig.send.apply(xhr, args);
        } catch {
          /* the request was already sent or the page reset it meanwhile */
        }
      };
      self.hooks.protectAsync(rule.action).then(
        (r) => go(r.token),
        () => go(null),
      );
    } as Xhr["send"];

    const abort = function (this: Xhr) {
      const state = states.get(this);
      if (state) state.cancelled = true;
      return orig.abort.apply(this);
    } as Xhr["abort"];

    const wraps = { open, send, abort };
    const restore = () => {
      for (const k of ["open", "send", "abort"] as const) {
        if (proto[k] === wraps[k]) (proto as unknown as Record<string, unknown>)[k] = orig[k];
      }
    };
    try {
      proto.open = open;
      proto.send = send;
      proto.abort = abort;
      this.undo.push(restore);
    } catch {
      /* frozen prototype: put back whatever was replaced */
      try {
        restore();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Form posts can't wait for a fresh token without cancelling the submission, so they carry the token held now
   * (every batch refreshes it). The `protect` record is sent with a keepalive flush, which survives the navigation.
   */
  private submit(e: Event): void {
    if (!this.active || e.defaultPrevented) return;
    try {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const submitter = (e as SubmitEvent).submitter ?? null;
      // getAttribute, not form.method/form.action: an input named "method" or "action" shadows those properties.
      const method = (submitter?.getAttribute("formmethod") || form.getAttribute("method") || "get").toLowerCase();
      if (method !== "post") return;
      const action = submitter?.getAttribute("formaction") ?? form.getAttribute("action");
      const rule = this.match("POST", action || document.URL);
      if (!rule) return;
      const token = this.hooks.protectNow(rule.action);
      let input = form.querySelector<HTMLInputElement>(`input[name="${TOKEN_FIELD}"]`);
      if (token) {
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = TOKEN_FIELD;
          form.appendChild(input);
          this.inputs.add(input);
        }
        input.value = token;
      } else if (input && this.inputs.has(input)) {
        input.remove();
        this.inputs.delete(input);
      }
    } catch {
      /* let the submission go as the page made it */
    }
  }
}

/**
 * `fetch` arguments with the token header added. Headers given in `init` replace a Request's own (as fetch does),
 * so start from those when present, otherwise from the Request's. The body is passed along untouched.
 */
function withHeader(args: Parameters<Fetch>, token: string): Parameters<Fetch> {
  const [input, init] = args;
  const req = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const headers = new Headers(init && init.headers !== undefined ? init.headers : req ? req.headers : undefined);
  headers.set(TOKEN_HEADER, token);
  return [input, { ...init, headers }];
}
