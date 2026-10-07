import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `npm run test:libsql`: the service tests again, with the libSQL (Turso) adapter on a temporary file
// instead of SQLite in memory (see openTestDatabase in src/server/test-utils.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/server/services/**/*.test.ts", "src/server/auth/**/*.test.ts"],
    env: { LSC_TEST_DB: "libsql" },
    testTimeout: 20_000,
    execArgv: ["--disable-warning=ExperimentalWarning"],
  },
});
