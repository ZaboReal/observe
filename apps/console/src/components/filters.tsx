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
    <label className="relative flex h-[34px] w-full items-center sm:w-64">
      <Search size={14} className="pointer-events-none absolute left-3.5 text-ink-3" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full w-full rounded-full border-0 bg-sheet pr-8 pl-9 text-[13px] shadow-ring placeholder:text-ink-3 focus:shadow-[0_0_0_1.5px_var(--color-ink)] focus:outline-none"
      />
      {value && (
        <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="absolute right-3 text-ink-3 hover:text-ink">
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
      className="h-[34px] max-w-full rounded-full border-0 bg-sheet pr-8 pl-3.5 text-[13px] text-ink-2 shadow-ring focus:shadow-[0_0_0_1.5px_var(--color-ink)] focus:outline-none"
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
      className={`inline-flex h-[34px] items-center gap-2 rounded-full px-3.5 text-[13px] transition-colors ${on ? "bg-ink text-white" : "bg-sheet text-ink-2 shadow-ring hover:text-ink"}`}
    >
      <span className={`inline-block size-3.5 rounded-[5px] ${on ? "bg-white" : "shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]"}`}>
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
      className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-green-soft pr-2.5 pl-3.5 text-[13px] font-medium text-green"
      aria-label={`Remove filter ${label}`}
    >
      {label}
      <X size={13} />
    </button>
  );
}
