import { DRIVERS } from "../src/registry";

describe("driver registry", () => {
  it("has unique driver ids", () => {
    const ids = DRIVERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never maps one acting marker to two drivers", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const d of DRIVERS) {
      const keys = [
        ...(d.windowGlobals ?? []).map((x) => `global:${x}`),
        ...(d.documentGlobals ?? []).map((x) => `doc:${x}`),
        ...(d.activeDom?.ids ?? []).map((x) => `id:${x}`),
        ...(d.activeDom?.classes ?? []).map((x) => `class:${x}`),
        ...(d.activeDom?.attributes ?? []).map((x) => `attr:${x.toLowerCase()}`),
        ...(d.activeDom?.tags ?? []).map((x) => `tag:${x.toLowerCase()}`),
        ...(d.extensionIds ?? []).map((x) => `ext:${x}`),
        ...(d.declaredUserAgent ?? []).map((x) => `ua:${x}`),
      ];
      for (const k of keys) {
        const prev = seen.get(k);
        if (prev && prev !== d.id) clashes.push(`${k} → ${prev} and ${d.id}`);
        seen.set(k, d.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("keeps stack and console markers specific enough to avoid matching ordinary sites", () => {
    for (const d of DRIVERS) {
      for (const m of [...(d.stackMarkers ?? []), ...(d.consoleMarkers ?? []), ...(d.wrapperMarkers ?? [])]) expect(m.length, `${d.id}: ${m}`).toBeGreaterThanOrEqual(5);
      for (const m of d.stackMarkers ?? []) expect(/^(app|main|index|bundle)\.js$/.test(m), `${d.id}: ${m}`).toBe(false);
    }
  });

  it("builds products only on drivers it knows, one level deep", () => {
    const ids = new Set(DRIVERS.map((d) => d.id));
    for (const d of DRIVERS.filter((x) => x.builtOn)) {
      expect(ids.has(d.builtOn!), `${d.id} → ${d.builtOn}`).toBe(true);
      expect(DRIVERS.find((x) => x.id === d.builtOn)?.builtOn, `${d.builtOn} is itself built on something`).toBeUndefined();
    }
  });

  it("gives every driver a source", () => {
    for (const d of DRIVERS) expect(d.sources.length, d.id).toBeGreaterThan(0);
  });
});
