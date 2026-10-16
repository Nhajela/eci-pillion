import { sql } from "drizzle-orm";
import { db, hasDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (hasDb()) await db().execute(sql`select 1`);
  return Response.json({ ok: true, db: hasDb() });
}
