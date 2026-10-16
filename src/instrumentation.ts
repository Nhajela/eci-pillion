// Runs once when the server starts: apply migrations, then tick every minute.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const path = await import("node:path");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("@/db");
  await migrate(db(), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const { tick } = await import("@/services/ticker");
  const { getNotifier } = await import("@/lib/runtime");
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(db(), getNotifier(), new Date());
    } catch (e) {
      console.error("tick failed", e);
    } finally {
      busy = false;
    }
  }, 60_000);
}
