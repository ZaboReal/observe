import type { NextConfig } from "next";

const config: NextConfig = {
  // A second build next to the dev server's (e.g. a production build to test against): NEXT_DIST_DIR=.next-prod.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // The hosted sensor (scripts/copy-public.mjs): versioned files never change; the v1 alias and manifest move with
  // releases. Loadable from any site.
  async headers() {
    const shared = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ];
    return [
      { source: "/sensor/:version/observe.min.js", headers: [...shared, { key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sensor/v1/observe.min.js", headers: [...shared, { key: "Cache-Control", value: "public, max-age=300" }] },
      { source: "/sensor/manifest.json", headers: [...shared, { key: "Cache-Control", value: "public, max-age=300" }] },
      { source: "/packages/:file", headers: [{ key: "Cache-Control", value: "public, max-age=300" }] },
      { source: "/llms.txt", headers: [{ key: "Cache-Control", value: "public, max-age=300" }] },
    ];
  },
  poweredByHeader: false,
  devIndicators: false,
};

export default config;
