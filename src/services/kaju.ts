import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { kaju } from "@/db/schema";
import { istDay } from "@/lib/time";

type Tx = Pick<Db, "insert" | "select">;

/** Add a ledger row once per (user, reason, ref). Returns the amount actually added (0 if already there). */
export async function award(tx: Tx, userId: number, amount: number, reason: string, ref: string, now: Date) {
  if (amount === 0) return 0;
  const rows = await tx
    .insert(kaju)
    .values({ userId, amount, reason, ref, day: istDay(now), createdAt: now })
    .onConflictDoNothing()
    .returning({ id: kaju.id });
  return rows.length ? amount : 0;
}

export async function balance(db: Tx, userId: number) {
  const [r] = await db.select({ s: sql<number>`coalesce(sum(${kaju.amount}), 0)::int` }).from(kaju).where(eq(kaju.userId, userId));
  return r?.s ?? 0;
}

export async function earnedToday(db: Tx, userId: number, reason: string, now: Date) {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${kaju.amount}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(kaju)
    .where(and(eq(kaju.userId, userId), eq(kaju.reason, reason), eq(kaju.day, istDay(now))));
  return { sum: r?.s ?? 0, count: r?.n ?? 0 };
}

export async function history(db: Tx, userId: number, limit = 20) {
  return db.select().from(kaju).where(eq(kaju.userId, userId)).orderBy(desc(kaju.createdAt), desc(kaju.id)).limit(limit);
}

export const REASON_LABEL: Record<string, string> = {
  signup: "Joined Pillion",
  plan: "Posted a plan",
  ride_pilot: "Gave a ride",
  ride_hitcher: "Took a ride",
  float: "Floated",
  late_cancel: "Cancelled last-minute",
  floater_refusal: "Turned down a request while floating",
  plan_cancel: "Cancelled a plan (kaju back)",
  prize: "Daily prize",
  invite_join: "A friend you invited joined",
  invite_ride: "A friend you invited took their first ride",
};
