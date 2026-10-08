import { headers } from "next/headers";
import type { Metadata } from "next";

import { CodeBlock, CopyButton } from "@/components/code";
import { LiveToggle } from "@/components/live";
import { LiveDot, Mono, Page, PageHeader, Panel } from "@/components/ui";
import { ago, num } from "@/lib/format";
import { jevConfig } from "@/lib/jev";
import { store } from "@/lib/store";
import { currentSite } from "@/lib/current-site";
import { syncStore } from "@/lib/sync";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await syncStore();
  const site = await currentSite();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const endpoint = `${proto}://${host}/api`;
  const now = Date.now();
  const last = store.lastSensorEvent(site.id);
  const sensorSessions = store.sensor.size;
  const jev = jevConfig();
  let lastAnswer: number | null = null;
  let lastError: { at: number; message: string } | null = null;
  for (const r of store.sensor.values()) {
    if (r.jev && r.jev.at > (lastAnswer ?? 0)) lastAnswer = r.jev.at;
    if (r.jevStatus.error && r.jevStatus.at > (lastError?.at ?? 0)) lastError = { at: r.jevStatus.at, message: r.jevStatus.error };
  }

  const npm = `import { init } from "@observe/sensor";

const sensor = init({
  publishableKey: "${site.publishableKey}",
  endpoint: "${endpoint}",
});`;

  const tag = `<script
  src="/observe-sensor.min.js"
  data-key="${site.publishableKey}"
  data-endpoint="${endpoint}"
></script>`;

  const identify = `// After sign-in. Use your own internal ids, never names, emails or tokens.
sensor.identify({ userId: user.id, accountId: workspace.id });`;

  const protect = `// Right before a sensitive action, send who is driving along with the request.
const { passport } = sensor.protect("export_report");
await fetch("/api/reports/export", {
  method: "POST",
  headers: { "X-Observe-Passport": JSON.stringify(passport) },
});`;

  const steps = [
    {
      title: "Add the sensor",
      body: "It watches how the session is driven: pointer paths, key timing, how scrolling arrives and the marks agents leave on the page. It never reads what people type or see.",
      code: [
        { lang: "ts", code: npm },
        { lang: "html · script tag", code: tag },
      ],
    },
    {
      title: "Say who is signed in",
      body: site.anonymous
        ? `Optional. Visitors to ${site.host} aren't signed in, so sessions show as Visitor with a short device id. If people do sign in somewhere, this groups their sessions by person and account.`
        : "Sessions are grouped by person and account, so you can see which customers hand work to agents.",
      code: [{ lang: "ts", code: identify }],
    },
    {
      title: "Mark sensitive actions",
      body: "Exports, invites, payments and settings changes show up in Activity with what your rules would decide.",
      code: [{ lang: "ts", code: protect }],
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Setup"
        title={
          <>
            Add the sensor <em>to {site.host}</em>
          </>
        }
        description="One script tag, and your own sessions start arriving here within seconds."
        actions={<LiveToggle />}
      />

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-3">
          {steps.map((s, i) => (
            <Panel key={s.title}>
              <div className="flex gap-4 pt-2">
                <span className="font-mono text-[12.5px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-medium tracking-[-0.015em]">{s.title}</h2>
                  <p className="mt-1 mb-4 text-[13.5px] leading-[1.6] text-ink-2">{s.body}</p>
                  <div className="space-y-3">
                    {s.code.map((c) => (
                      <CodeBlock key={c.lang} lang={c.lang} code={c.code} />
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="grid min-w-0 gap-3">
          <Panel title="Sensor">
            {last ? (
              <>
                <div className="flex items-center gap-2.5 text-[14px] font-medium">
                  <LiveDot /> Receiving
                </div>
                <p className="mt-1 text-[13px] text-ink-2">
                  Last batch {ago(last, now)} · {num(sensorSessions)} {sensorSessions === 1 ? "session" : "sessions"} reported
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 text-[14px] font-medium">
                  <LiveDot live={false} /> Waiting for the first batch
                </div>
                <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">
                  {site.demo ? (
                    <>
                      Until then the console shows demo traffic. Sessions from the sensor appear alongside it, marked{" "}
                      <span className="rounded-full bg-track px-1.5 py-px font-mono text-[10.5px] text-ink-2">sensor</span>.
                    </>
                  ) : (
                    "Sessions appear as soon as the sensor sends its first batch."
                  )}
                </p>
              </>
            )}
          </Panel>

          <Panel title="Who-is-driving model" description="Jev decides who drives each sensor session">
            <div className="flex items-center gap-2.5 text-[14px] font-medium">
              <LiveDot live={Boolean(jev.apiKey) && !(lastError && lastError.at > (lastAnswer ?? 0))} />
              {jev.apiKey ? (lastAnswer ? "Answering" : "Connected, waiting for a session") : "Not configured"}
            </div>
            <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">
              {jev.apiKey ? (
                <>
                  <Mono className="text-[12px]">{jev.model}</Mono>
                  {lastAnswer ? ` · last answer ${ago(lastAnswer, now)}` : ""}
                </>
              ) : (
                <>
                  Add <Mono className="text-[12px]">TYPESAFE_API_KEY</Mono> to <Mono className="text-[12px]">apps/console/.env.local</Mono>. Until then the sensor&apos;s own rules decide.
                </>
              )}
            </p>
            {lastError && lastError.at > (lastAnswer ?? 0) && <p className="mt-2 text-[12.5px] text-red">Last error: {lastError.message}</p>}
          </Panel>

          <Panel title="Keys" flush>
            <dl>
              {[
                { label: "Publishable key", value: site.publishableKey },
                { label: "Collector endpoint", value: endpoint },
              ].map((k) => (
                <div key={k.label} className="border-t border-line px-4 py-3 first:border-t-0">
                  <dt className="eyebrow">{k.label}</dt>
                  <dd className="mt-1 flex items-center justify-between gap-2">
                    <Mono className="truncate">{k.value}</Mono>
                    <CopyButton text={k.value} label={`Copy ${k.label.toLowerCase()}`} />
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="API" flush>
            <ul className="text-[13px]">
              {[
                { route: "POST /api/v1/sdk/events", about: "Batches from the sensor. Behaviour only, no content." },
                { route: "GET /api/v1/sessions", about: "Recent sessions with who is driving and their last activity." },
                { route: "GET /api/v1/entries", about: "Agent actions and what the rules decided. Add format=csv for a file." },
                { route: "GET /api/v1/sensor-sessions", about: "Sensor sessions with how each was decided and Jev's answer." },
              ].map((a) => (
                <li key={a.route} className="border-t border-line px-4 py-3 first:border-t-0">
                  <Mono className="text-[12px]">{a.route}</Mono>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{a.about}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
