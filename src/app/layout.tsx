import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/context";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/server/locale";

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
    <html lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
