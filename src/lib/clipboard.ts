/**
 * Copies text to the clipboard. `navigator.clipboard` only exists on secure pages (https or
 * localhost), so on a plain-http local network address it falls back to selecting the given
 * field and using the older copy command. Returns false when nothing worked.
 */
export async function copyText(text: string, field?: HTMLInputElement | HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the fallback
  }
  if (field) {
    field.focus();
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
  return false;
}
