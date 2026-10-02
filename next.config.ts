import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy for pages. Next.js injects small inline scripts for
// hydration, so 'unsafe-inline' is required for scripts unless a nonce-based
// setup is used. Everything else is restricted to this origin: no external
// scripts, styles, fonts, images or frames can be loaded.
const pageCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-src 'self'", // the study PDF is shown in a same-origin iframe
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Since Next.js 16.3, `next dev` writes an "agent rules" block into CLAUDE.md / AGENTS.md when it
  // detects an AI coding assistant. This project keeps its own CLAUDE.md (iGEM's responsible-AI-use
  // notes), so that automatic edit is switched off.
  agentRules: false,
  // The Dockerfile sets NEXT_OUTPUT=standalone to build a minimal server bundle.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async headers() {
    return [
      {
        // pages (everything except the JSON/PDF API)
        source: "/((?!api/).*)",
        headers: [
          ...commonHeaders,
          { key: "Content-Security-Policy", value: pageCsp },
        ],
      },
      {
        // API responses: never cache. (No CSP here: a restrictive CSP on the
        // PDF response would stop the browser's built-in PDF viewer.)
        source: "/api/:path*",
        headers: [
          ...commonHeaders,
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
