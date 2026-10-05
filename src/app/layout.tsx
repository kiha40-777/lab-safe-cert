import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/context";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/server/locale";

// Noto Sans for Latin text, Noto Sans JP for Japanese. next/font downloads them at build time and serves them
// from this app, so the page CSP (font-src 'self') still holds and no request goes to Google at run time.
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", display: "swap" });
// The Japanese font is split into many small files by unicode-range; only the ones a page needs are loaded.
const notoSansJp = Noto_Sans_JP({ preload: false, variable: "--font-noto-sans-jp", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const name = translate(locale, "app.name");
  return {
    title: { default: name, template: `%s · ${name}` },
    description:
      "Web-based knowledge tests for laboratory safety certification, made for iGEM teams. Open source (Apache-2.0).",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} className={`${notoSans.variable} ${notoSansJp.variable}`}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
