import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 20_000,
    // node:sqlite prints an "experimental" notice in every test process; it is expected, so hide it.
    execArgv: ["--disable-warning=ExperimentalWarning"],
  },
});
