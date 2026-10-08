import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The client tests (happy-dom) inject a script tag; don't let happy-dom try to fetch it.
    environmentOptions: { happyDOM: { settings: { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true } } },
  },
});
