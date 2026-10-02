import type { Metadata } from "next";
import { AdminApp } from "@/features/admin/AdminApp";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/server/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translate(await getRequestLocale(), "app.adminSuffix") };
}

export default function AdminPage() {
  return <AdminApp />;
}
