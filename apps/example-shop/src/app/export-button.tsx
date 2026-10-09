"use client";

import { useState } from "react";
import type { ObserveDecision } from "@observe/next";

import { SHOW_DECISIONS } from "@/lib/display";

import { Decision } from "./decision";

interface ExportResult {
  decision: ObserveDecision;
  /** Agent billing: what the agent was billed for this export. */
  charge?: { display: string; to: string } | null;
  filename?: string;
  csv?: string;
  error?: string;
}

export function ExportButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function exportCsv() {
    setPending(true);
    setFailed(null);
    try {
      // The sensor sees this POST matches a protect rule and adds the x-observe-token header.
      const res = await fetch("/api/invoices/export", { method: "POST" });
      setResult((await res.json()) as ExportResult);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  const href = result?.csv ? `data:text/csv;charset=utf-8,${encodeURIComponent(result.csv)}` : null;

  return (
    <div className="export">
      <button type="button" onClick={exportCsv} disabled={pending}>
        {pending ? "Exporting…" : "Export CSV"}
      </button>
      {failed && <p className="error">Export failed: {failed}</p>}
      {result && (
        <div className="result">
          {SHOW_DECISIONS && <Decision decision={result.decision} />}
          {result.error && <p className="error">{result.error}</p>}
          {result.charge && (
            <p className="charge">
              <strong>{result.charge.display}</strong> billed to {result.charge.to} for this export.
            </p>
          )}
          {href && (
            <>
              <a href={href} download={result.filename}>
                Download {result.filename}
              </a>
              {SHOW_DECISIONS && <pre>{result.csv}</pre>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
