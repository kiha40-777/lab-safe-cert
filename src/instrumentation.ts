/**
 * Runs once when the server starts. Opens the database, applies migrations and,
 * on the very first start, generates the admin password and prints it in the
 * terminal (see src/server/context.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getAppContext } = await import("./server/context");
    await getAppContext();
  }
}
