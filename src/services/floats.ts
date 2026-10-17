import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { floats, plans, users, type Float, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { floatKaju } from "@/lib/kaju";
import { FLOAT_RADIUS_M } from "@/lib/match";
import { distanceM, nearestPlace, placeById, placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { award, earnedToday } from "./kaju";

const MAX_FLOAT_S = 8 * 3600;
const STATIC_FLOAT_S = 3600;

/** A location from Telegram. livePeriod set = live location; null = a one-off pin (counts for an hour). */
export async function locate(db: Db, n: Notifier, user: User, loc: { lat: number; lng: number; livePeriod?: number | null }, now: Date) {
  const [active] = await db.select().from(floats).where(and(eq(floats.userId, user.id), isNull(floats.endedAt)));
  const secs = Math.min(MAX_FLOAT_S, loc.livePeriod && loc.livePeriod > 0 ? loc.livePeriod : STATIC_FLOAT_S);
  if (active && active.liveUntil > now) {
    const liveUntil = loc.livePeriod ? new Date(Math.min(active.startedAt.getTime() + MAX_FLOAT_S * 1000, Math.max(active.liveUntil.getTime(), now.getTime() + secs * 1000))) : active.liveUntil;
    await db.update(floats).set({ lat: loc.lat, lng: loc.lng, lastSeenAt: now, liveUntil }).where(eq(floats.id, active.id));
    return { started: false, near: nearestPlace(loc).place.name };
  }
  if (active) await endFloat(db, n, active, now);
  const [f] = await db
    .insert(floats)
    .values({ userId: user.id, lat: loc.lat, lng: loc.lng, startedAt: now, lastSeenAt: now, liveUntil: new Date(now.getTime() + secs * 1000) })
    .onConflictDoNothing()
    .returning();
  const near = nearestPlace(loc).place.name;
  if (!f) return { started: false, near };
  await n.announce(pick(LINES.floatStart, { name: esc(user.name), near }));
  // open requests nearby in the next hour
  const reqs = await db
    .select({ p: plans, u: users })
    .from(plans)
    .innerJoin(users, eq(plans.userId, users.id))
    .where(and(eq(plans.kind, "request"), eq(plans.status, "open"), lt(plans.departAt, new Date(now.getTime() + 3600_000)), gt(plans.departAt, new Date(now.getTime() - 15 * 60_000))));
  let told = 0;
  for (const { p, u } of reqs) {
    const from = placeById(p.fromPlace);
    if (u.id === user.id || !from || distanceM(loc, from) > FLOAT_RADIUS_M || told >= 3) continue;
    told++;
    await n.dm({
      to: user.telegramId,
      text: pick(LINES.rideWanted, { name: esc(u.name), from: from.name, to: placeName(p.toPlace), time: istHHMM(p.departAt) }),
      buttons: [[{ text: "🙋 I'll take them", data: `take:${p.id}` }]],
    });
  }
  return { started: true, near };
}

/** End a float and pay for it. Safe to call twice. */
export async function endFloat(db: Db, n: Notifier, f: Float, now: Date) {
  const end = new Date(Math.min(now.getTime(), f.liveUntil.getTime()));
  const res = await db.transaction(async (tx) => {
    const done = await tx.update(floats).set({ endedAt: end }).where(and(eq(floats.id, f.id), isNull(floats.endedAt))).returning();
    if (!done.length) return null;
    const minutes = Math.round((end.getTime() - f.startedAt.getTime()) / 60_000);
    const [fresh] = await tx.select({ forfeit: floats.forfeitMinutes }).from(floats).where(eq(floats.id, f.id));
    const today = await earnedToday(tx, f.userId, "float", now);
    const got = await award(tx, f.userId, floatKaju(minutes - (fresh?.forfeit ?? 0), today.sum), "float", `float:${f.id}`, now);
    return { minutes, got };
  });
  if (res && res.minutes >= 15) {
    const [u] = await db.select().from(users).where(eq(users.id, f.userId));
    await n.dm({ to: u.telegramId, text: pick(LINES.floatThanks, { minutes: res.minutes, kaju: res.got }) });
  }
  return res;
}

export async function stopFloat(db: Db, n: Notifier, user: User, now: Date) {
  const [active] = await db.select().from(floats).where(and(eq(floats.userId, user.id), isNull(floats.endedAt)));
  return active ? endFloat(db, n, active, now) : null;
}

export async function closeExpiredFloats(db: Db, n: Notifier, now: Date) {
  const due = await db.select().from(floats).where(and(isNull(floats.endedAt), lt(floats.liveUntil, now)));
  for (const f of due) await endFloat(db, n, f, now);
  return due.length;
}

export async function activeFloats(db: Db, now: Date) {
  return db
    .select({ f: floats, u: users })
    .from(floats)
    .innerJoin(users, eq(floats.userId, users.id))
    .where(and(isNull(floats.endedAt), gt(floats.liveUntil, now)));
}
