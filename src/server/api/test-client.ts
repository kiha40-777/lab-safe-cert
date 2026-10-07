/// <reference types="vite/client" />
// A tiny "browser" for tests: calls the route handlers in src/app/api directly
// (no HTTP server needed), keeps cookies between calls, and lists every route.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { getAppContext, resetAppContextForTests } from "../context";

type Handler = (req: Request, routeContext?: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface RouteEntry {
  /** e.g. /api/participant/attempts/[id]/submit */
  template: string;
  pattern: RegExp;
  keys: string[];
  handlers: Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;
}

// Vite loads every src/app/api/**/route.ts file, so no route can be forgotten by the tests.
const modules = import.meta.glob("../../app/api/**/route.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** Like Next.js: when two routes match, the one with a fixed segment beats one with a [parameter] segment. */
function bySpecificity(a: RouteEntry, b: RouteEntry): number {
  const left = a.template.split("/");
  const right = b.template.split("/");
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const leftDynamic = left[i]!.startsWith("[");
    const rightDynamic = right[i]!.startsWith("[");
    if (leftDynamic !== rightDynamic) return leftDynamic ? 1 : -1;
  }
  return a.template.localeCompare(b.template);
}

export const routes: RouteEntry[] = Object.entries(modules)
  .map(([file, module]) => {
  const template = "/api/" + file.replace("../../app/api/", "").replace(/\/?route\.ts$/, "");
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\[([^\]]+)\\\]/g, (_, key: string) => {
        keys.push(key);
        return "([^/]+)";
      }) +
      "$",
  );
  const handlers: RouteEntry["handlers"] = {};
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
    const handler = module[method];
    if (typeof handler === "function") handlers[method] = handler as Handler;
  }
  return { template, pattern, keys, handlers };
  })
  .sort(bySpecificity);

export interface CallOptions {
  /** Sent as JSON (or as raw bytes when `pdf` is used). */
  json?: unknown;
  pdf?: Uint8Array;
  headers?: Record<string, string>;
  /** Do not send this client's cookies. */
  anonymous?: boolean;
  /** Do not add the default same-origin Origin header (like a non-browser client). */
  noOrigin?: boolean;
  /** Body sent as is, with the given content type. */
  raw?: { body: string | Uint8Array; contentType: string };
}

export class ApiClient {
  readonly cookies = new Map<string, string>();

  cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const url = new URL(path, "http://localhost:3000");
    const route = routes.find((r) => r.pattern.test(url.pathname));
    if (!route) throw new Error(`no route for ${method} ${url.pathname}`);
    const handler = route.handlers[method as keyof RouteEntry["handlers"]];
    if (!handler) return new Response(null, { status: 405 });

    const params: Record<string, string> = {};
    const match = route.pattern.exec(url.pathname);
    route.keys.forEach((key, i) => (params[key] = decodeURIComponent(match?.[i + 1] ?? "")));

    const headers = new Headers({ host: "localhost:3000", ...options.headers });
    let body: BodyInit | undefined;
    if (options.pdf !== undefined) {
      headers.set("content-type", "application/pdf");
      body = new Uint8Array(options.pdf);
    } else if (options.raw !== undefined) {
      headers.set("content-type", options.raw.contentType);
      body = typeof options.raw.body === "string" ? options.raw.body : new Uint8Array(options.raw.body);
    } else if (options.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.json);
    }
    if (method !== "GET" && !options.noOrigin && !headers.has("origin")) {
      headers.set("origin", "http://localhost:3000");
    }
    if (!options.anonymous && this.cookies.size > 0) headers.set("cookie", this.cookieHeader());

    const response = await handler(new Request(url, { method, headers, body }), {
      params: Promise.resolve(params),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = cookie.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attributes.some((a) => a.toLowerCase() === "max-age=0");
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  get = (path: string, options?: CallOptions) => this.call("GET", path, options);
  post = (path: string, json?: unknown, options?: CallOptions) => this.call("POST", path, { json, ...options });
  put = (path: string, json?: unknown, options?: CallOptions) => this.call("PUT", path, { json, ...options });
  patch = (path: string, json?: unknown, options?: CallOptions) => this.call("PATCH", path, { json, ...options });
  delete = (path: string, options?: CallOptions) => this.call("DELETE", path, options);

  async loginAs(scope: "participant" | "admin", password: string): Promise<Response> {
    return this.post("/api/auth/login", { scope, password });
  }
}

export const ADMIN_PASSWORD = "admin-password-for-tests";
export const PARTICIPANT_PASSWORD = "participant-password-for-tests";

export interface ApiEnvironment {
  /** Restores the environment and deletes the temporary data folder. */
  cleanup: () => Promise<void>;
  /** Everything the server printed with console.log since start-up (e.g. the first-start admin password). */
  consoleOutput: () => string;
}

/**
 * Starts the app for a test in a temporary data folder with test passwords (an
 * entry of `env` set to null removes that variable). Call `cleanup` afterwards.
 */
export async function setupApiEnvironment(env: Record<string, string | null> = {}): Promise<ApiEnvironment> {
  const dir = mkdtempSync(join(tmpdir(), "lsc-api-"));
  const saved = { ...process.env };
  const wanted: Record<string, string | null> = {
    DATA_DIR: dir,
    ADMIN_PASSWORD,
    PARTICIPANT_PASSWORD,
    TRUST_PROXY: null,
    COOKIE_SECURE: null,
    TURSO_DATABASE_URL: null,
    TURSO_AUTH_TOKEN: null,
    RENDER: null,
    LSC_RESET_ADMIN_PASSWORD: null,
    ...env,
  };
  for (const [key, value] of Object.entries(wanted)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await resetAppContextForTests();
  await getAppContext();
  return {
    cleanup: async () => {
      await resetAppContextForTests();
      log.mockRestore();
      for (const key of Object.keys(wanted)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      rmSync(dir, { recursive: true, force: true });
    },
    consoleOutput: () => log.mock.calls.map((args) => args.join(" ")).join("\n"),
  };
}

/** A minimal file that passes the PDF check. */
export const tinyPdf = (text = "study material") => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF`);
