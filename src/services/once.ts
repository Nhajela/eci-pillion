import type { Db } from "@/db";
import { sentKeys } from "@/db/schema";

/** Claim a once-only key. True the first time only. */
export async function once(db: Pick<Db, "insert">, key: string) {
  const r = await db.insert(sentKeys).values({ key }).onConflictDoNothing().returning();
  return r.length > 0;
}
