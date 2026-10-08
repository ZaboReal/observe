import { llmsTxt } from "@/lib/install";
import { consoleOrigin, sensorManifest } from "@/lib/origin";

/** Install instructions for coding agents (docs/install.md). Public. */
export async function GET() {
  const origin = await consoleOrigin();
  return new Response(llmsTxt({ console: origin, sensor: await sensorManifest(origin) }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
