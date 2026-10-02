import Link from "next/link";
import { makeTranslator } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/server/locale";

export default async function NotFound() {
  const t = makeTranslator(await getRequestLocale());
  return (
    <main id="main" className="container">
      <div className="card card-narrow stack">
        <h1>404</h1>
        <p>{t("errors.notFound")}</p>
        <Link className="btn btn-primary" href="/">
          {t("result.backHome")}
        </Link>
      </div>
    </main>
  );
}
