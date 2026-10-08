import type { NextConfig } from "next";

const config: NextConfig = {
  // A second build next to the dev server's: NEXT_DIST_DIR=.next-prod.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
};

export default config;
