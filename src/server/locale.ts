import { headers } from "next/headers";
import { pickLocale } from "@/lib/i18n/detect";
import type { Locale } from "@/lib/i18n/messages";

/** The language to render this request in (visitor's choice, DEFAULT_LANG, else English). Server components only. */
export async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  return pickLocale({
    cookie: requestHeaders.get("cookie"),
    defaultLang: process.env.DEFAULT_LANG,
  });
}
