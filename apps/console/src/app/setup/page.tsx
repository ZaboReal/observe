import type { Metadata } from "next";

import { CodeBlock, CopyButton } from "@/components/code";
import { LiveToggle } from "@/components/live";
import { RotateSecret } from "@/components/rotate-secret";
import { LiveDot, Mono, Page, PageHeader, Panel } from "@/components/ui";
import { currentSite } from "@/lib/current-site";
import { dbWritable } from "@/lib/db";
import { ago, num } from "@/lib/format";
import { agentPrompt, nextSteps, otherSteps } from "@/lib/install";
import { jevConfig } from "@/lib/jev";
import { consoleOrigin, sensorManifest } from "@/lib/origin";
import { store } from "@/lib/store";
import { syncStore } from "@/lib/sync";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Panel>
      <div className="flex gap-4 pt-2">
        <span className="font-mono text-[12.5px] text-ink-3">{String(n).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-medium tracking-[-0.015em]">{title}</h2>
          <div className="mt-1 space-y-3 text-[13.5px] leading-[1.6] text-ink-2">{children}</div>
        </div>
      </div>
    </Panel>
  );
}

export default async function SetupPage() {
  await syncStore();
  const site = await currentSite();
  const origin = await consoleOrigin();
  const sensor = await sensorManifest(origin);
  const target = { console: origin, publishableKey: site.publishableKey, host: site.host, sensor };
  const next = nextSteps(target);
  const other = otherSteps(target);

  const now = Date.now();
  const last = store.lastSensorEvent(site.id);
  const siteSessions = [...store.sensor.values()].filter((r) => r.site === site.id).length;
  const jev = jevConfig();
  let lastAnswer: number | null = null;
  let lastError: { at: number; message: string } | null = null;
  for (const r of store.sensor.values()) {
    if (r.site !== site.id) continue;
    if (r.jev && r.jev.at > (lastAnswer ?? 0)) lastAnswer = r.jev.at;
    if (r.jevStatus.error && r.jevStatus.at > (lastError?.at ?? 0)) lastError = { at: r.jevStatus.at, message: r.jevStatus.error };
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Setup"
        title={
          <>
            Put Observe in front <em>of {site.host}</em>
          </>
        }
        description="Everything runs through your own domain, no cookies reach us, and your server makes the call at sensitive actions."
        actions={<LiveToggle />}
      />

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <Step n={1} title="Install with your coding agent">
            <p>
              Paste this into Claude Code, Cursor or any coding agent working in the site&apos;s repo. It follows{" "}
              <a className="text-ink underline underline-offset-2" href="/llms.txt">
                /llms.txt
              </a>
              , finds the sensitive actions itself, wires them up in observe mode and opens a pull request for you to review.
            </p>
            <CodeBlock lang="prompt" code={agentPrompt(target)} />
          </Step>

          <Step n={2} title="Or by hand: Next.js">
            <p>A forwarding route serves the sensor and passes its batches through your domain, stripping cookies. Updates arrive automatically.</p>
            <CodeBlock lang="shell" code={next.install} />
            <CodeBlock lang="env" code={next.env} />
            <CodeBlock lang="ts" code={next.route} />
            <CodeBlock lang="tsx" code={next.layout} />
            <CodeBlock lang="ts" code={next.check} />
          </Step>

          <Step n={3} title="Or by hand: any other site">
            <p>Serve a pinned copy of the sensor, checked against its published hash, and forward one path to Observe.</p>
            <CodeBlock lang="shell" code={other.download} />
            <CodeBlock lang="html" code={other.tag} />
            <CodeBlock lang="vercel.json" code={other.vercel} />
            <CodeBlock lang="netlify" code={other.netlify} />
            <CodeBlock lang="nginx" code={other.nginx} />
            <CodeBlock lang="your server" code={other.check} />
          </Step>

          <Step n={4} title="Check it works">
            <p>
              Open {site.host} with <Mono className="text-[12.5px]">?observe_debug=1</Mono>. A panel shows what the sensor sees, and the session appears here within seconds. Add{" "}
              <Mono className="text-[12.5px]">?observe_driver=human</Mono> (or the agent&apos;s name) to label a test run.
            </p>
          </Step>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <Panel title="Sensor">
            {last ? (
              <>
                <div className="flex items-center gap-2.5 text-[14px] font-medium">
                  <LiveDot /> Receiving
                </div>
                <p className="mt-1 text-[13px] text-ink-2">
                  Last batch {ago(last, now)} · {num(siteSessions)} {siteSessions === 1 ? "session" : "sessions"} this week
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 text-[14px] font-medium">
                  <LiveDot live={false} /> Waiting for the first batch
                </div>
                <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">
                  {site.demo ? "Until then this demo shows generated traffic. Sessions from the sensor appear alongside it." : "Sessions appear as soon as the sensor sends its first batch."}
                </p>
              </>
            )}
            {sensor && (
              <p className="mt-2 text-[12.5px] text-ink-3">
                Hosted sensor <Mono className="text-[12px]">{sensor.version}</Mono>
              </p>
            )}
          </Panel>

          <Panel title="Keys" flush>
            <dl>
              <div className="px-4 py-3">
                <dt className="eyebrow">Publishable key</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <Mono className="truncate">{site.publishableKey}</Mono>
                  <CopyButton text={site.publishableKey} label="Copy publishable key" />
                </dd>
                <p className="mt-1 text-[12px] text-ink-3">Public. Goes in the page.</p>
              </div>
              <div className="border-t border-line px-4 py-3">
                <dt className="eyebrow">Secret key</dt>
                <dd className="mt-1 text-[12.5px] leading-[1.5] text-ink-2">
                  {site.stored ? (
                    <>
                      Server only, as <Mono className="text-[12px]">OBSERVE_SECRET_KEY</Mono>. Shown once when the site was created; we keep only a hash.
                      {dbWritable && <RotateSecret siteId={site.id} />}
                    </>
                  ) : (
                    "This site has none: add a site to get keys for your server."
                  )}
                </dd>
              </div>
              <div className="border-t border-line px-4 py-3">
                <dt className="eyebrow">Console</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <Mono className="truncate">{origin}</Mono>
                  <CopyButton text={origin} label="Copy console URL" />
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Who-is-driving model" description="Decides who drives each session from how the page is driven">
            <div className="flex items-center gap-2.5 text-[14px] font-medium">
              <LiveDot live={Boolean(jev.apiKey) && !(lastError && lastError.at > (lastAnswer ?? 0))} />
              {jev.apiKey ? (lastAnswer ? "Answering" : "Connected, waiting for a session") : "Not configured"}
            </div>
            <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">
              {jev.apiKey
                ? lastAnswer
                  ? `Last answer ${ago(lastAnswer, now)}`
                  : "Answers as soon as a session has something to judge."
                : "Not set up on this console yet. Until it is, the sensor's own rules decide."}
            </p>
            {lastError && lastError.at > (lastAnswer ?? 0) && <p className="mt-2 text-[12.5px] text-red">Unavailable right now; the sensor&apos;s own rules decide meanwhile.</p>}
          </Panel>

          <Panel title="API" flush>
            <ul className="text-[13px]">
              {[
                { route: "POST /api/v1/sdk/events", about: "Batches from the sensor, through your domain. Behaviour only, no content. Returns the session token." },
                { route: "POST /api/v1/decide", about: "Your server asks what to do at a protected action. Secret key and the page's token." },
                { route: "GET /sensor/manifest.json", about: "The current sensor version and its integrity hash, for pinning." },
                { route: "GET /llms.txt", about: "Install instructions for coding agents." },
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
