import { json, route } from "@/server/http/route";
import { getSubmittedAttemptForAdmin } from "@/server/services/attempts";

export const dynamic = "force-dynamic";

/** One submitted attempt in full: questions, choices, the person's answers, correct answers, verdict. */
export const GET = route<{ id: string }>({ auth: "admin" }, async ({ ctx, params }) =>
  json(await getSubmittedAttemptForAdmin(ctx, params.id)),
);
