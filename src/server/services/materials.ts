import { createHash } from "node:crypto";
import type { MaterialInfo } from "@/lib/types";
import type { AppContext } from "../context";
import type { Db } from "../db/types";
import { badRequest } from "../http/errors";

const MAX_FILENAME_CHARS = 120;

/**
 * A PDF is stored in pieces of this size (table material_chunks). Some databases and connections refuse
 * a single large value; many small ones work everywhere, so the size of a PDF does not need a limit.
 */
export const CHUNK_BYTES = 256 * 1024;

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
  if (!looksLikePdf(bytes)) throw badRequest("notPdf");

  const info: MaterialInfo = {
    filename: sanitizeFilename(rawFilename),
    size: bytes.length,
    uploadedAt: ctx.now().toISOString(),
  };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await ctx.db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO materials (test_id, filename, size, sha256, uploaded_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(test_id) DO UPDATE SET
         filename = excluded.filename, size = excluded.size, sha256 = excluded.sha256,
         uploaded_at = excluded.uploaded_at`,
      [testId, info.filename, info.size, sha256, info.uploadedAt],
    );
    await tx.run("DELETE FROM material_chunks WHERE test_id = ?", [testId]);
    for (let index = 0, offset = 0; offset < bytes.length; index += 1, offset += CHUNK_BYTES) {
      await tx.run("INSERT INTO material_chunks (test_id, idx, data) VALUES (?, ?, ?)", [
        testId,
        index,
        bytes.slice(offset, offset + CHUNK_BYTES),
      ]);
    }
  });
  return info;
}

/** How often a PDF is read again when it was replaced while it was being read. */
const READ_ATTEMPTS = 3;

export async function getMaterialFile(
  db: Db,
  testId: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    const material = await db.get<{ filename: string; size: number; sha256: string }>(
      "SELECT filename, size, sha256 FROM materials WHERE test_id = ?",
      [testId],
    );
    if (!material) return null;
    const pieces = await db.all<{ idx: number }>(
      "SELECT idx FROM material_chunks WHERE test_id = ? ORDER BY idx",
      [testId],
    );
    const chunks = await Promise.all(
      pieces.map((piece) =>
        db.get<{ data: Uint8Array }>("SELECT data FROM material_chunks WHERE test_id = ? AND idx = ?", [
          testId,
          piece.idx,
        ]),
      ),
    );
    if (chunks.some((chunk) => chunk === undefined)) continue; // replaced or deleted meanwhile: read again
    const bytes = Buffer.concat(chunks.map((chunk) => chunk?.data ?? new Uint8Array()));
    if (bytes.length === material.size && createHash("sha256").update(bytes).digest("hex") === material.sha256) {
      return { filename: material.filename, bytes };
    }
  }
  throw new Error(`The stored study PDF of "${testId}" is incomplete or damaged. Upload it again.`);
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
  await ctx.db.transaction(async (tx) => {
    await tx.run("DELETE FROM material_chunks WHERE test_id = ?", [testId]);
    await tx.run("DELETE FROM materials WHERE test_id = ?", [testId]);
  });
}
