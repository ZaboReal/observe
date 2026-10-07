import { clock, clockSeconds, dateTime } from "@/lib/format";

import { LocalTime, type TimeFormat } from "./local-time";

const FORMATS = { clock, seconds: clockSeconds, datetime: dateTime };

/** A timestamp for server components; see `LocalTime`. */
export function Time({ t, format = "clock" }: { t: number; format?: TimeFormat }) {
  return <LocalTime t={t} format={format} initial={FORMATS[format](t)} />;
}
