import { createHash } from "node:crypto";
import type { MaterialInfo } from "@/lib/types";
import type { AppContext } from "../context";
import type { Db } from "../db/types";
import { ApiError, badRequest } from "../http/errors";

const MAX_FILENAME_CHARS = 120;

/** A safe display/download file name: no path parts, no control characters, ends in .pdf. */
export function sanitizeFilename(raw: string | null): string {
  let name = raw ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the undecoded value
  }
  name = name.replace(/\p{Cc}|["]/gu, "_");
  name = name.split(/[\\/]/).pop()?.trim() ?? "";
  if (name === "" || name === ".pdf") name = "study-material.pdf";
  if (!/\.pdf$/i.test(name)) name += ".pdf";
  if ([...name].length > MAX_FILENAME_CHARS) {
    name = [...name].slice(0, MAX_FILENAME_CHARS - 4).join("") + ".pdf";
  }
  return name;
}

/** PDF files start with "%PDF-" (a few stray bytes before it are tolerated, as by PDF readers). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 1024)).indexOf("%PDF-") >= 0;
}

export async function saveMaterial(
  ctx: AppContext,
  testId: string,
  rawFilename: string | null,
  bytes: Uint8Array,
): Promise<MaterialInfo> {
  if (bytes.length === 0) throw badRequest("emptyFile");
  if (bytes.length > ctx.env.maxPdfBytes) {
    throw new ApiError(413, "fileTooLarge", { maxMb: Math.floor(ctx.env.maxPdfBytes / (1024 * 1024)) });
  }
  if (!looksLikePdf(bytes)) throw badRequest("notPdf");

  const info: MaterialInfo = {
    filename: sanitizeFilename(rawFilename),
    size: bytes.length,
    uploadedAt: ctx.now().toISOString(),
  };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await ctx.db.run(
    `INSERT INTO materials (test_id, filename, size, sha256, uploaded_at, data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(test_id) DO UPDATE SET
       filename = excluded.filename, size = excluded.size, sha256 = excluded.sha256,
       uploaded_at = excluded.uploaded_at, data = excluded.data`,
    [testId, info.filename, info.size, sha256, info.uploadedAt, bytes],
  );
  return info;
}

export async function getMaterialFile(
  db: Db,
  testId: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const row = await db.get<{ filename: string; data: Uint8Array }>(
    "SELECT filename, data FROM materials WHERE test_id = ?",
    [testId],
  );
  return row ? { filename: row.filename, bytes: row.data } : null;
}

export async function listMaterialInfos(db: Db): Promise<Map<string, MaterialInfo>> {
  const rows = await db.all<{ test_id: string; filename: string; size: number; uploaded_at: string }>(
    "SELECT test_id, filename, size, uploaded_at FROM materials",
  );
  return new Map(
    rows.map((r) => [r.test_id, { filename: r.filename, size: r.size, uploadedAt: r.uploaded_at }]),
  );
}

export async function deleteMaterial(ctx: AppContext, testId: string): Promise<void> {
  await ctx.db.run("DELETE FROM materials WHERE test_id = ?", [testId]);
}
