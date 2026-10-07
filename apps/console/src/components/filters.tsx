"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/** Update one or more query params, keeping the rest. */
function useParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export function SearchBox({ placeholder = "Search" }: { placeholder?: string }) {
  const { params, set } = useParam();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const id = setTimeout(() => set({ q: value || null }), 250);
    return () => clearTimeout(id);
    // Only the typed value should schedule a search; params changing underneath must not re-run it.
  }, [value]);

  return (
    <label className="relative flex h-8 w-full items-center sm:w-64">
      <Search size={14} className="pointer-events-none absolute left-2.5 text-ink-4" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full w-full rounded-lg border border-line bg-canvas pr-7 pl-8 text-[13px] placeholder:text-ink-4 focus:border-ink-3 focus:outline-none"
      />
      {value && (
        <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="absolute right-2 text-ink-4 hover:text-ink">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function SelectFilter({ name, label, options }: { name: string; label: string; options: { value: string; label: string }[] }) {
  const { params, set } = useParam();
  return (
    <select
      value={params.get(name) ?? ""}
      onChange={(e) => set({ [name]: e.target.value || null })}
      aria-label={label}
      className="h-8 rounded-lg border border-line bg-canvas pr-7 pl-2.5 text-[13px] text-ink-2 focus:border-ink-3 focus:outline-none"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ToggleFilter({ name, label }: { name: string; label: string }) {
  const { params, set } = useParam();
  const on = params.get(name) === "1";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => set({ [name]: on ? null : "1" })}
      className={`inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[13px] transition-colors ${
        on ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-line-2 hover:text-ink"
      }`}
    >
      <span className={`inline-block size-3 rounded-[4px] border ${on ? "border-canvas bg-canvas" : "border-ink-4"}`}>
        {on && (
          <svg viewBox="0 0 12 12" className="size-full text-ink" aria-hidden="true">
            <path d="M3 6.2 5 8.2 9 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

/** A removable chip for a filter that was set by following a link, such as one account. */
export function FilterChip({ name, label }: { name: string; label: string }) {
  const { set } = useParam();
  return (
    <button
      type="button"
      onClick={() => set({ [name]: null })}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink pr-2 pl-2.5 text-[13px]"
      aria-label={`Remove filter ${label}`}
    >
      {label}
      <X size={13} className="text-ink-3" />
    </button>
  );
}
