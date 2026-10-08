"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      className={`inline-flex h-[34px] items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
        paused ? "bg-track text-ink-2 hover:text-ink" : "bg-green-soft text-green hover:bg-[#d5ece3]"
      }`}
    >
      <span className={`live sm ${paused ? "off" : ""}`} aria-hidden="true" />
      {paused ? "Paused" : "Live"}
    </button>
  );
}
