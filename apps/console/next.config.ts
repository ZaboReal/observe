import type { NextConfig } from "next";

const config: NextConfig = {
  // A second build next to the dev server's (e.g. a production build to test against): NEXT_DIST_DIR=.next-prod.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
};

export default config;
