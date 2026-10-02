import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config.ts", () => {
  it("does not let `next dev` write into CLAUDE.md / AGENTS.md", () => {
    // Next.js 16.3+ appends an "agent rules" block to these files when it detects an AI coding
    // assistant. The repository keeps its own CLAUDE.md, so this must stay switched off.
    expect(nextConfig.agentRules).toBe(false);
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sends a Content-Security-Policy with pages, and no CSP with API responses", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const header = (source: string, key: string) =>
      rules.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value;

    const pageSource = "/((?!api/).*)";
    const csp = header(pageSource, "Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-src 'self'"); // the study PDF is shown in a same-origin frame
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toMatch(/https?:\/\//); // nothing may be loaded from another site

    // A restrictive CSP on the PDF response would stop the browser's built-in PDF viewer.
    expect(header("/api/:path*", "Content-Security-Policy")).toBeUndefined();
    expect(header("/api/:path*", "Cache-Control")).toBe("no-store");

    for (const source of [pageSource, "/api/:path*"]) {
      expect(header(source, "X-Content-Type-Options")).toBe("nosniff");
      expect(header(source, "Referrer-Policy")).toBe("no-referrer");
      expect(header(source, "X-Frame-Options")).toBe("SAMEORIGIN");
    }
  });

  it("builds a standalone server only when asked to (Docker)", () => {
    expect(process.env.NEXT_OUTPUT).not.toBe("standalone"); // tests run in a normal environment
    expect(nextConfig.output).toBeUndefined();
  });
});
