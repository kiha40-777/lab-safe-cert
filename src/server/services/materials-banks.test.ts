import { describe, expect, it } from "vitest";
import type { Bank } from "../bank/types";
import { makeQuestions, makeTestContext } from "../test-utils";
import { loadBank, loadBankMetas, saveBank } from "./banks";
import {
  deleteMaterial,
  getMaterialFile,
  listMaterialInfos,
  looksLikePdf,
  sanitizeFilename,
  saveMaterial,
} from "./materials";

const pdf = (extra = "") => new TextEncoder().encode(`%PDF-1.4\n${extra}\n%%EOF`);

describe("sanitizeFilename", () => {
  it("keeps normal names, adds .pdf when missing, and decodes URL encoding", () => {
    expect(sanitizeFilename("notes.pdf")).toBe("notes.pdf");
    expect(sanitizeFilename("notes")).toBe("notes.pdf");
    expect(sanitizeFilename("NOTES.PDF")).toBe("NOTES.PDF");
    expect(sanitizeFilename(encodeURIComponent("安全講習 資料.pdf"))).toBe("安全講習 資料.pdf");
  });

  it("removes path parts, quotes and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd.pdf");
    expect(sanitizeFilename("C:\\Users\\me\\a.pdf")).toBe("a.pdf");
    expect(sanitizeFilename('we"ird\r\nname.pdf')).toBe("we_ird__name.pdf");
  });

  it("falls back to a default and limits the length", () => {
    expect(sanitizeFilename(null)).toBe("study-material.pdf");
    expect(sanitizeFilename("   ")).toBe("study-material.pdf");
    expect(sanitizeFilename("%E0%A4%A")).toContain(".pdf"); // invalid escape sequence does not throw
    const long = sanitizeFilename("a".repeat(500) + ".pdf");
    expect([...long].length).toBeLessThanOrEqual(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("looksLikePdf", () => {
  it("recognizes the PDF header, also after a few stray bytes", () => {
    expect(looksLikePdf(pdf())).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("\n\n%PDF-1.7\n..."))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("<html>not a pdf</html>"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe("study material storage", () => {
  it("stores, replaces, lists and deletes a PDF per test", async () => {
    const ctx = await makeTestContext();
    const info = await saveMaterial(ctx, "participant", "first.pdf", pdf("one"));
    expect(info).toMatchObject({ filename: "first.pdf", size: pdf("one").length });

    const file = await getMaterialFile(ctx.db, "participant");
    expect(file?.filename).toBe("first.pdf");
    expect(new TextDecoder().decode(file?.bytes)).toContain("one");

    await saveMaterial(ctx, "participant", "second.pdf", pdf("two"));
    expect(new TextDecoder().decode((await getMaterialFile(ctx.db, "participant"))?.bytes)).toContain("two");
    await saveMaterial(ctx, "supervisor", "other.pdf", pdf("three"));

    const infos = await listMaterialInfos(ctx.db);
    expect([...infos.keys()].sort()).toEqual(["participant", "supervisor"]);
    expect(infos.get("participant")?.filename).toBe("second.pdf");

    await deleteMaterial(ctx, "participant");
    expect(await getMaterialFile(ctx.db, "participant")).toBeNull();
    expect(await getMaterialFile(ctx.db, "supervisor")).not.toBeNull();
  });

  it("keeps every byte of a binary file", async () => {
    const ctx = await makeTestContext();
    const bytes = new Uint8Array(70_000);
    bytes.set(pdf());
    for (let i = 40; i < bytes.length; i++) bytes[i] = i % 256;
    await saveMaterial(ctx, "participant", "big.pdf", bytes);
    const stored = (await getMaterialFile(ctx.db, "participant"))?.bytes;
    expect(stored?.length).toBe(70_000);
    expect(Buffer.from(stored as Uint8Array).equals(Buffer.from(bytes))).toBe(true);
  });

  it("rejects empty files, files that are not PDFs and files over the size limit", async () => {
    const ctx = await makeTestContext({ env: { MAX_PDF_MB: "1" } });
    await expect(saveMaterial(ctx, "participant", "a.pdf", new Uint8Array())).rejects.toMatchObject({
      status: 400,
      code: "emptyFile",
    });
    await expect(saveMaterial(ctx, "participant", "a.pdf", new TextEncoder().encode("hello"))).rejects.toMatchObject({
      status: 400,
      code: "notPdf",
    });
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(pdf());
    await expect(saveMaterial(ctx, "participant", "a.pdf", big)).rejects.toMatchObject({
      status: 413,
      code: "fileTooLarge",
      params: { maxMb: 1 },
    });
    expect(await listMaterialInfos(ctx.db)).toEqual(new Map());
  });
});

describe("question bank storage", () => {
  const bank = (count = 60): Bank => ({
    info: { generator: "AI model", generatedAt: "2030-01-01", source: "study.pdf" },
    questions: makeQuestions(count),
  });

  it("stores a confirmed import and reads it back", async () => {
    const ctx = await makeTestContext();
    const meta = await saveBank(ctx, "participant", bank(), { kind: "import", reviewConfirmed: true });
    expect(meta).toMatchObject({
      generator: "AI model",
      generatedAt: "2030-01-01",
      source: "study.pdf",
      importedAt: "2030-01-01T00:00:00.000Z",
      reviewConfirmedAt: "2030-01-01T00:00:00.000Z",
    });
    const stored = await loadBank(ctx.db, "participant");
    expect(stored?.questions).toHaveLength(60);
    expect(stored?.questions[0]).toEqual(makeQuestions(1)[0]);
    expect(await loadBank(ctx.db, "supervisor")).toBeNull();
  });

  it("refuses an import that was not confirmed as reviewed by a person", async () => {
    const ctx = await makeTestContext();
    await expect(saveBank(ctx, "participant", bank(), { kind: "import", reviewConfirmed: false })).rejects.toMatchObject({
      status: 400,
      code: "reviewNotConfirmed",
    });
    expect(await loadBank(ctx.db, "participant")).toBeNull();
  });

  it("replaces the previous bank", async () => {
    const ctx = await makeTestContext();
    await saveBank(ctx, "participant", bank(60), { kind: "import", reviewConfirmed: true });
    await saveBank(ctx, "participant", bank(45), { kind: "import", reviewConfirmed: true });
    expect((await loadBank(ctx.db, "participant"))?.questions).toHaveLength(45);
    expect(await ctx.db.all("SELECT test_id FROM banks")).toHaveLength(1);
  });

  it("keeps the review confirmation and import time when the bank is edited", async () => {
    const ctx = await makeTestContext();
    await saveBank(ctx, "participant", bank(), { kind: "import", reviewConfirmed: true });
    ctx.advance(60 * 60_000);
    const edited = bank();
    edited.info.generator = "AI model, corrected by hand";
    const meta = await saveBank(ctx, "participant", edited, { kind: "edit", reviewConfirmed: false });
    expect(meta).toMatchObject({
      generator: "AI model, corrected by hand",
      importedAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T01:00:00.000Z",
      reviewConfirmedAt: "2030-01-01T00:00:00.000Z",
    });
  });

  it("requires the review confirmation when a bank is first created by editing", async () => {
    const ctx = await makeTestContext();
    await expect(saveBank(ctx, "participant", bank(), { kind: "edit", reviewConfirmed: false })).rejects.toMatchObject({
      code: "reviewNotConfirmed",
    });
    const meta = await saveBank(ctx, "participant", bank(), { kind: "edit", reviewConfirmed: true });
    expect(meta.reviewConfirmedAt).not.toBeNull();
  });

  it("lists question counts without loading the questions", async () => {
    const ctx = await makeTestContext();
    await saveBank(ctx, "participant", bank(60), { kind: "import", reviewConfirmed: true });
    await saveBank(ctx, "supervisor", bank(31), { kind: "import", reviewConfirmed: true });
    const metas = await loadBankMetas(ctx.db);
    expect(metas.get("participant")?.count).toBe(60);
    expect(metas.get("supervisor")?.count).toBe(31);
  });
});
