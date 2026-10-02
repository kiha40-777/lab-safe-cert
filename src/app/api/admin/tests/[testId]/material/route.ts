import { ApiError, notFound } from "@/server/http/errors";
import { readBody } from "@/server/http/body";
import { pdfResponse } from "@/server/http/files";
import { json, route } from "@/server/http/route";
import { deleteMaterial, getMaterialFile, saveMaterial } from "@/server/services/materials";
import { requireTest } from "@/server/services/tests";

export const dynamic = "force-dynamic";

/** Uploads (or replaces) the study PDF. The body is the PDF itself; the file name goes in the X-Filename header. */
export const PUT = route<{ testId: string }>({ auth: "admin", body: "pdf" }, async ({ req, ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  let bytes: Uint8Array;
  try {
    bytes = await readBody(req, ctx.env.maxPdfBytes);
  } catch (error) {
    if (error instanceof ApiError && error.code === "payloadTooLarge") {
      throw new ApiError(413, "fileTooLarge", { maxMb: Math.floor(ctx.env.maxPdfBytes / (1024 * 1024)) });
    }
    throw error;
  }
  const material = await saveMaterial(ctx, test.id, req.headers.get("x-filename"), bytes);
  return json({ material });
});

/** The stored PDF (for the admin's preview). */
export const GET = route<{ testId: string }>({ auth: "admin" }, async ({ ctx, params, url }) => {
  const test = requireTest(ctx.config, params.testId);
  const file = await getMaterialFile(ctx.db, test.id);
  if (!file) throw notFound("materialNotFound");
  return pdfResponse(file, url.searchParams.get("download") === "1");
});

export const DELETE = route<{ testId: string }>({ auth: "admin", body: "none" }, async ({ ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  await deleteMaterial(ctx, test.id);
  return json({ ok: true });
});
