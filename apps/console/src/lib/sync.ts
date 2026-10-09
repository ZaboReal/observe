import "server-only";

import { batchesAfter, dbConfigured, jevAfter, listPrices, listRates, listSites } from "./db";
import { ingest, parseBatch } from "./ingest";
import { resolvePassport } from "./passport";
import { setStoredPrices, setStoredRates } from "./pricing";
import { setStoredSites } from "./site";
import { HISTORY, store, type JevResult } from "./store";

/**
 * Brings this server's in-memory store up to date with the database before a page or API reads it: the sites and
 * their agent prices are refreshed, new sensor batches are replayed through the same ingest code, in the order they
 * arrived and at the time they arrived, then Jev's stored answers are applied. Without a database (local development)
 * there is nothing to do.
 *
 * Calls within a second and a half of the last sync reuse it. A forced sync (after a batch was just stored)
 * always runs, after any sync already in flight, so it is sure to include that batch.
 */

const MIN_INTERVAL_MS = 1_500;
const PAGE = 1_000;

interface SyncState {
  sitesAt: number;
  sitesLoading: Promise<void> | null;
  afterId: number;
  jevAfter: number;
  lastAt: number;
  running: Promise<void> | null;
  queued: Promise<void> | null;
}

// On globalThis so a dev-server reload keeps the cursor along with the store it describes.
const g = globalThis as unknown as { __observeSync?: SyncState };
const state = (g.__observeSync ??= { sitesAt: 0, sitesLoading: null, afterId: 0, jevAfter: 0, lastAt: 0, running: null, queued: null });

/** How long the list of sites is trusted before the collector reloads it. */
const SITES_TTL_MS = 60_000;

/**
 * Make sure the database's sites are loaded, without a full sync. The collector calls this before looking up a
 * batch's key, so a freshly started server knows every site from its first request.
 */
export function ensureSites(): Promise<void> {
  if (!dbConfigured || Date.now() - state.sitesAt < SITES_TTL_MS) return Promise.resolve();
  return (state.sitesLoading ??= Promise.all([listSites(), listPrices(), listRates()])
    .then(([rows, prices, rates]) => {
      setStoredSites(rows);
      setStoredPrices(prices);
      setStoredRates(rates);
      state.sitesAt = Date.now();
    })
    .catch((e) => console.error("[observe] could not load sites:", e instanceof Error ? e.message : e))
    .finally(() => {
      state.sitesLoading = null;
    }));
}

export function syncStore(force = false): Promise<void> {
  if (!dbConfigured) return Promise.resolve();
  if (state.running) {
    if (!force) return state.running;
    // The running sync may have started before the caller's batch was stored: run once more after it.
    return (state.queued ??= state.running.then(() => {
      state.queued = null;
      return syncStore(true);
    }));
  }
  if (!force && Date.now() - state.lastAt < MIN_INTERVAL_MS) return Promise.resolve();
  state.running = run().finally(() => {
    state.running = null;
  });
  return state.running;
}

async function run(): Promise<void> {
  const started = Date.now();
  try {
    const since = started - HISTORY;
    const [sites, prices, rates] = await Promise.all([listSites(), listPrices(), listRates()]);
    setStoredSites(sites);
    setStoredPrices(prices);
    setStoredRates(rates);
    state.sitesAt = Date.now();
    for (;;) {
      const rows = await batchesAfter(state.afterId, since, PAGE);
      for (const row of rows) {
        state.afterId = Math.max(state.afterId, row.id);
        const batch = parseBatch(row.body);
        if (batch) ingest(batch, row.received_at, row.meta ?? {}, row.site);
      }
      if (rows.length < PAGE) break;
    }
    for (const row of await jevAfter(state.jevAfter)) {
      state.jevAfter = Math.max(state.jevAfter, row.updated_at);
      const rec = store.sensor.get(row.session_id);
      const answer = row.answer as JevResult;
      if (!rec || (rec.jev && rec.jev.at >= answer.at)) continue;
      rec.jev = answer;
      // The stored fingerprint says which evidence Jev saw, so this instance does not ask again about it.
      rec.jevStatus.key = row.fingerprint;
      rec.jevStatus.at = answer.at;
      rec.jevStatus.error = null;
      resolvePassport(rec);
    }
    state.lastAt = started;
  } catch (e) {
    // Pages still render from what is already in memory; the next request tries again.
    console.error("[observe] sync failed:", e instanceof Error ? e.message : e);
  }
}
