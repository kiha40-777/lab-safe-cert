// Browser-side helper for calling the JSON API in src/app/api.
import type { ApiErrorBody, ValidationResultDto } from "./types";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly params?: Record<string, string | number>,
    /** Present when a saved question bank was refused (HTTP 422). */
    public readonly validation?: ValidationResultDto,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

/** Sent on `window` when a call is refused because the login has expired. */
export const UNAUTHORIZED_EVENT = "lsc:unauthorized";

interface RequestOptions {
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  let body = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiClientError(0, "network");
  }

  if (!response.ok) {
    let code = "unknown";
    let params: Record<string, string | number> | undefined;
    let validation: ValidationResultDto | undefined;
    try {
      const data = (await response.json()) as ApiErrorBody & { validation?: ValidationResultDto };
      code = data.error.code;
      params = data.error.params;
      validation = data.validation;
    } catch {
      // not a JSON error body
    }
    if (response.status === 401 && path !== "/api/auth/login" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiClientError(response.status, code, params, validation);
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, json?: unknown) => request<T>("POST", path, { json: json ?? {} }),
  put: <T>(path: string, json?: unknown) => request<T>("PUT", path, { json: json ?? {} }),
  patch: <T>(path: string, json?: unknown) => request<T>("PATCH", path, { json: json ?? {} }),
  delete: <T>(path: string) => request<T>("DELETE", path),
  /** Uploads a PDF as the raw request body (the file name travels in a header). */
  uploadPdf: <T>(path: string, file: File) =>
    request<T>("PUT", path, {
      body: file,
      headers: { "Content-Type": "application/pdf", "X-Filename": encodeURIComponent(file.name) },
    }),
};
