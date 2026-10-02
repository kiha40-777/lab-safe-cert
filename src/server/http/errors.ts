/**
 * An error that is reported to the client as `{ error: { code, params } }`.
 * `code` is a stable identifier that the UI translates (errors.<code>).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const badRequest = (code: string, params?: Record<string, string | number>) =>
  new ApiError(400, code, params);
export const unauthorized = (code = "unauthorized") => new ApiError(401, code);
export const forbidden = (code = "forbidden") => new ApiError(403, code);
export const notFound = (code = "notFound") => new ApiError(404, code);
export const conflict = (code: string, params?: Record<string, string | number>) =>
  new ApiError(409, code, params);
