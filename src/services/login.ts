import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { loginCodes } from "@/db/schema";
import { newCode } from "@/lib/session";

const PENDING_MIN = 10; // to tap Start in Telegram
const CLAIMED_MIN = 30; // to come back to the browser

const ago = (now: Date, m: number) => new Date(now.getTime() - m * 60_000);

export async function startLogin(db: Db, now: Date) {
  const code = newCode();
  await db.insert(loginCodes).values({ code, createdAt: now });
  await db.delete(loginCodes).where(lt(loginCodes.createdAt, ago(now, 24 * 60)));
  return code;
}

/** Bot: someone tapped Start with this code. */
export async function claimLogin(db: Db, code: string, userId: number, now: Date) {
  const r = await db
    .update(loginCodes)
    .set({ userId, claimedAt: now })
    .where(and(eq(loginCodes.code, code), isNull(loginCodes.claimedAt), gt(loginCodes.createdAt, ago(now, PENDING_MIN))))
    .returning();
  return r.length > 0;
}

/** Bot: a ready-made login link (/web). */
export async function magicCode(db: Db, userId: number, now: Date) {
  const code = newCode();
  await db.insert(loginCodes).values({ code, userId, claimedAt: now, createdAt: now });
  return code;
}

/** Browser: pending, expired, or the user id (single use). */
export async function redeemLogin(db: Db, code: string, now: Date): Promise<"pending" | "expired" | number> {
  const [r] = await db.select().from(loginCodes).where(eq(loginCodes.code, code));
  if (!r) return "expired";
  if (!r.claimedAt) return r.createdAt > ago(now, PENDING_MIN) ? "pending" : "expired";
  if (r.claimedAt < ago(now, CLAIMED_MIN) || !r.userId) return "expired";
  const used = await db.delete(loginCodes).where(and(eq(loginCodes.code, code), isNotNull(loginCodes.claimedAt))).returning();
  return used.length ? r.userId : "expired";
}
