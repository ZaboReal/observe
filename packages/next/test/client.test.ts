// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initObserve } from "../src/init";
import { startSensor } from "../src/start";

type W = Window & { ObserveSensor?: { init: (c: unknown) => unknown; instance?: unknown }; __observeStarted?: boolean };
const w = window as W;

let init: ReturnType<typeof vi.fn>;

beforeEach(() => {
  delete w.ObserveSensor;
  delete w.__observeStarted;
  document.head.innerHTML = "";
  init = vi.fn(() => ({ started: true }));
  vi.stubEnv("NEXT_PUBLIC_OBSERVE_KEY", "pk_shop_0123456789abcdef");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const protect = [{ path: "/api/invoices/export", method: "POST", action: "export_invoices" }];

describe("startSensor", () => {
  it("inits the sensor with the key, endpoint and protect rules, once per page", () => {
    w.ObserveSensor = { init };
    expect(startSensor({ protect })).toBe(true);
    expect(startSensor({ protect })).toBe(false);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ endpoint: "/_observe", publishableKey: "pk_shop_0123456789abcdef", protect });
    expect(w.ObserveSensor.instance).toEqual({ started: true });
  });

  it("prefers siteKey, and honours path and debug", () => {
    w.ObserveSensor = { init };
    startSensor({ siteKey: "pk_other_0000000000000000", path: "/obs/", debug: true });
    expect(init).toHaveBeenCalledWith({ endpoint: "/obs", publishableKey: "pk_other_0000000000000000", debug: true });
  });

  it("does nothing when the script did not load (the no-op fallback)", () => {
    expect(startSensor({})).toBe(false);
    expect(w.__observeStarted).toBeUndefined();
  });

  it("does not start a sensor the script tag already started", () => {
    w.ObserveSensor = { init, instance: {} };
    expect(startSensor({})).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });
});

describe("initObserve", () => {
  it("injects one script tag for the first-party route and inits on load", () => {
    initObserve({ protect });
    initObserve({ protect });
    const scripts = document.querySelectorAll("script#observe-sensor");
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.getAttribute("src")).toBe("/_observe/s.js");
    expect(init).not.toHaveBeenCalled();

    w.ObserveSensor = { init };
    script.dispatchEvent(new Event("load"));
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "/_observe", protect }));
  });

  it("inits straight away when the script is already on the page", () => {
    w.ObserveSensor = { init };
    initObserve({ path: "/custom" });
    expect(document.querySelector("script#observe-sensor")).toBeNull();
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "/custom" }));
  });
});
