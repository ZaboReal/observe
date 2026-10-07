"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? "Copied" : label}
      className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-wash-2 hover:text-ink"
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative rounded-lg border border-line bg-wash">
      <div className="flex items-center justify-between border-b border-line py-1 pr-1.5 pl-3.5">
        <span className="font-mono text-[11px] text-ink-3">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
