import { headers } from "next/headers";
import type { Metadata } from "next";

import { CodeBlock, CopyButton } from "@/components/code";
import { LiveToggle } from "@/components/live";
import { Card, CardHeader, LiveDot, Mono, Page, PageHeader } from "@/components/ui";
import { ago, num } from "@/lib/format";
import { jevConfig } from "@/lib/jev";
import { SITE } from "@/lib/site";
import { store } from "@/lib/store";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const endpoint = `${proto}://${host}/api`;
  const now = Date.now();
  const last = store.lastSensorEvent();
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
  publishableKey: "${SITE.publishableKey}",
  endpoint: "${endpoint}",
});`;

  const tag = `<script
  src="/observe-sensor.min.js"
  data-key="${SITE.publishableKey}"
  data-endpoint="${endpoint}"
></script>`;

  const identify = `// After sign-in. Use your own internal ids, never names, emails or tokens.
sensor.identify({ userId: user.id, accountId: workspace.id });`;

  const protect = `// Right before a sensitive action, send the passport with the request.
const { passport } = sensor.protect("export_report");
await fetch("/api/reports/export", {
  method: "POST",
  headers: { "X-Observe-Passport": JSON.stringify(passport) },
});`;

  const steps = [
    {
      title: "Add the sensor",
      body: "It watches how the session is driven: pointer paths, key timing, scroll mechanics and agent page artifacts. It never reads what people type or see.",
      code: [
        { lang: "ts", code: npm },
        { lang: "html · script tag", code: tag },
      ],
    },
    {
      title: "Say who is signed in",
      body: "Sessions are grouped by person and account, so you can see which customers hand work to agents.",
      code: [{ lang: "ts", code: identify }],
    },
    {
      title: "Mark sensitive actions",
      body: "Exports, invites, payments and settings changes show up in the entry log with the decision your policy would make.",
      code: [{ lang: "ts", code: protect }],
    },
  ];

  return (
    <Page>
      <PageHeader title="Setup" description={`Install the sensor on ${SITE.host} and watch your own sessions arrive.`} actions={<LiveToggle />} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {steps.map((s, i) => (
            <Card key={s.title}>
              <div className="flex gap-4 px-5 py-5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-ink text-[12px] font-medium">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[14px] font-medium">{s.title}</h2>
                  <p className="mt-1 mb-4 text-[13px] text-ink-3">{s.body}</p>
                  <div className="space-y-3">
                    {s.code.map((c) => (
                      <CodeBlock key={c.lang} lang={c.lang} code={c.code} />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Sensor status" />
            <div className="px-5 py-5">
              {last ? (
                <>
                  <div className="flex items-center gap-2 text-[14px] font-medium">
                    <LiveDot /> Receiving
                  </div>
                  <p className="mt-1 text-[13px] text-ink-3">
                    Last batch {ago(last, now)} · {num(sensorSessions)} {sensorSessions === 1 ? "session" : "sessions"} reported
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-[14px] font-medium">
                    <LiveDot live={false} /> Waiting for the first batch
                  </div>
                  <p className="mt-1 text-[13px] text-ink-3">
                    Until then the console shows demo traffic. Sessions from the sensor appear alongside it, marked <span className="rounded border border-line px-1 text-[11px] text-ink-2">sensor</span>.
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Who-is-driving model" description="Jev decides who drives each sensor session" />
            <div className="px-5 py-5 text-[13px]">
              <div className="flex items-center gap-2 text-[14px] font-medium">
                <LiveDot live={Boolean(jev.apiKey) && !(lastError && lastError.at > (lastAnswer ?? 0))} />
                {jev.apiKey ? (lastAnswer ? "Answering" : "Connected, waiting for a session") : "Not configured"}
              </div>
              <p className="mt-1 text-ink-3">
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
              {lastError && lastError.at > (lastAnswer ?? 0) && <p className="mt-2 text-[12.5px] text-ink-2">Last error: {lastError.message}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Keys" />
            <dl className="divide-y divide-line">
              {[
                { label: "Publishable key", value: SITE.publishableKey },
                { label: "Collector endpoint", value: endpoint },
              ].map((k) => (
                <div key={k.label} className="px-5 py-3">
                  <dt className="text-[12.5px] text-ink-3">{k.label}</dt>
                  <dd className="mt-0.5 flex items-center justify-between gap-2">
                    <Mono className="truncate">{k.value}</Mono>
                    <CopyButton text={k.value} label={`Copy ${k.label.toLowerCase()}`} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="API" />
            <ul className="divide-y divide-line text-[13px]">
              <li className="px-5 py-3">
                <Mono className="text-[12px]">POST /api/v1/sdk/events</Mono>
                <p className="mt-0.5 text-[12.5px] text-ink-3">Batches from the sensor. Behaviour only, no content.</p>
              </li>
              <li className="px-5 py-3">
                <Mono className="text-[12px]">GET /api/v1/sessions</Mono>
                <p className="mt-0.5 text-[12.5px] text-ink-3">Recent sessions with verdict, driver and last activity.</p>
              </li>
              <li className="px-5 py-3">
                <Mono className="text-[12px]">GET /api/v1/sensor-sessions</Mono>
                <p className="mt-0.5 text-[12.5px] text-ink-3">Sensor sessions with what decided each verdict and Jev&apos;s answer.</p>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
