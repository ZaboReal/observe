"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";

const KEY = "observe.live";
const INTERVAL = 4_000;

function readPaused(): boolean {
  try {
    return localStorage.getItem(KEY) === "paused";
  } catch {
    return false;
  }
}

/** Re-renders the page's server data every few seconds. Pausing is remembered per browser. */
export function LiveToggle() {
  const router = useRouter();
  const [paused, setPaused] = useState(false);

  useEffect(() => setPaused(readPaused()), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL);
    return () => clearInterval(id);
  }, [paused, router]);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try {
      localStorage.setItem(KEY, next ? "paused" : "live");
    } catch {
      /* private mode: the choice just isn't remembered */
    }
    if (!next) router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!paused}
      title={paused ? "Resume live updates" : "Pause live updates"}
      className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-canvas pr-2 pl-2.5 text-[12.5px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
    >
      <span className={`inline-block size-1.5 rounded-full ${paused ? "bg-ink-4" : "live-dot bg-ink"}`} />
      {paused ? "Paused" : "Live"}
      {paused ? <Play size={13} className="text-ink-3" /> : <Pause size={13} className="text-ink-3" />}
    </button>
  );
}
