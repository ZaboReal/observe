"use client";

import { useSyncExternalStore } from "react";

import { clock, clockSeconds, dateTime } from "@/lib/format";

const FORMATS = { clock, seconds: clockSeconds, datetime: dateTime };
export type TimeFormat = keyof typeof FORMATS;

const subscribe = () => () => {};

/**
 * Shows the server's rendering while hydrating, then the same instant in the viewer's time zone,
 * so a console hosted in UTC still reads in local time and matches the charts.
 */
export function LocalTime({ t, format, initial }: { t: number; format: TimeFormat; initial: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return <time dateTime={new Date(t).toISOString()}>{hydrated ? FORMATS[format](t) : initial}</time>;
}
