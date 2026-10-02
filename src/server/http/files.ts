/** Content-Disposition header value with a safe ASCII fallback and the real (UTF-8) file name. */
function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** A PDF, shown in the browser's own viewer (or downloaded with `download`). */
export function pdfResponse(file: { filename: string; bytes: Uint8Array }, download = false): Response {
  const body = new Uint8Array(file.bytes); // plain ArrayBuffer-backed copy
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", file.filename),
    },
  });
}

/** A text file the browser saves instead of showing (CSV, JSON). */
export function downloadResponse(content: string, filename: string, contentType: string): Response {
  return new Response(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition("attachment", filename),
    },
  });
}
