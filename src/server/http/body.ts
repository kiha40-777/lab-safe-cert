import { ApiError } from "./errors";

export const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** Reads a request body, giving up (413) as soon as it grows past `maxBytes` (no limit when it is left out). */
export async function readBody(req: Request, maxBytes = Number.POSITIVE_INFINITY): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "payloadTooLarge", { maxBytes });
  }
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "payloadTooLarge", { maxBytes });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads a JSON body. An empty body counts as `{}`. */
export async function readJson(req: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const bytes = await readBody(req, maxBytes);
  if (bytes.length === 0) return {};
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "badJson");
  }
}
