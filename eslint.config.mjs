import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Architectural guard: code that runs in the browser (or is shared with it)
// must never import server-only modules or Node.js built-ins.
const clientRestriction = {
  patterns: [
    {
      group: ["@/server", "@/server/*", "**/server/**"],
      message:
        "Client-side and shared code must not import from src/server (it uses Node.js APIs and secrets).",
    },
    {
      group: ["node:*"],
      message: "Node.js built-in modules are not available in client-side code.",
    },
  ],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/features/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": ["error", clientRestriction],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "scripts/**",
    "docs/**",
    ".claude/**",
  ]),
]);
