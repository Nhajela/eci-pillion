import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db";
import { floatPings, floats, plans, rides, users, type Float, type Plan, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { floatKaju, KAJU } from "@/lib/kaju";
import { FLOAT_RADIUS_M, MATCH_WINDOW_MIN, VILLAGE_RADIUS_M } from "@/lib/match";
import { destName, distanceM, located, nearestPlace, placeById, placeName } from "@/lib/places";
import { floatableMinutes, istDay, istHHMM, istMinuteOfDay } from "@/lib/time";
import { award, earnedToday } from "./kaju";
import { GameError } from "./errors";
import { once } from "./once";

const MAX_FLOAT_S = 8 * 3600;
const STATIC_FLOAT_S = 3600;
export const CHECK_AFTER_MIN = 30; // no location update for this long → "still floating?"
export const CHECK_GRACE_MIN = 15; // no answer → the float ends where the question was asked

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const inVillage = (pt: { lat: number; lng: number }) => nearestPlace(pt).metres <= VILLAGE_RADIUS_M;

export const floaterButtons = (requestId: number) => [
  [{ text: "🙋 I'll take them", data: `take:${requestId}` }, { text: "Can't right now", data: `nope:${requestId}` }],
];

/** Ping a floater about a request and remember it: a floater has to answer.
 *  Skipped at night (floating isn't paid then) and when they already have a ride around that time (they couldn't say yes). */
export async function pingFloater(db: Db | Tx, n: Notifier, floater: User, float: Float, req: Plan, owner: User, now: Date) {
  const m = istMinuteOfDay(now);
  if (m < 7 * 60 || m >= 23 * 60) return false;
  const W = MATCH_WINDOW_MIN * 60_000;
  const busy = await db
    .select({ id: rides.id })
    .from(rides)
    .where(and(eq(rides.status, "matched"), or(eq(rides.pilotId, floater.id), eq(rides.hitcherId, floater.id)), gt(rides.departAt, new Date(req.departAt.getTime() - W)), lt(rides.departAt, new Date(req.departAt.getTime() + W))))
    .limit(1);
  if (busy.length) return false;
  const r = await db.insert(floatPings).values({ floatId: float.id, userId: floater.id, requestId: req.id, pingedAt: now }).onConflictDoNothing().returning();
  if (!r.length) return false;
  await n.dm({
    to: floater.telegramId,
    text: `${pick(LINES.rideWanted, { name: esc(owner.name), from: placeName(req.fromPlace), to: destName(req.toPlace, req.note), time: istHHMM(req.departAt) })}\n<i>You're floating, so answer within ${KAJU.floaterAnswerMin} min, please.</i>`,
    buttons: floaterButtons(req.id),
  });
  return true;
}

/** A location from Telegram. livePeriod set = live location; null = a one-off pin (counts for an hour). */
export async function locate(db: Db, n: Notifier, user: User, loc: { lat: number; lng: number; livePeriod?: number | null }, now: Date) {
  const [active] = await db.select().from(floats).where(and(eq(floats.userId, user.id), isNull(floats.endedAt)));
  const near = nearestPlace(loc).place.name;
  if (user.vehicle === "none") return { started: false, near, noWheels: true as const };
  if (!inVillage(loc)) {
    if (active) await endFloat(db, n, active, now, "left the village");
    return { started: false, near, outside: true as const };
  }
  const secs = Math.min(MAX_FLOAT_S, loc.livePeriod && loc.livePeriod > 0 ? loc.livePeriod : STATIC_FLOAT_S);
  if (active && active.liveUntil > now) {
    const liveUntil = loc.livePeriod
      ? new Date(Math.min(active.startedAt.getTime() + MAX_FLOAT_S * 1000, Math.max(active.liveUntil.getTime(), now.getTime() + secs * 1000)))
      : active.liveUntil;
    await db.update(floats).set({ lat: loc.lat, lng: loc.lng, lastSeenAt: now, liveUntil, checkedAt: null }).where(eq(floats.id, active.id));
    return { started: false, near };
  }
  if (active) await endFloat(db, n, active, now);
  const [f] = await db
    .insert(floats)
    .values({ userId: user.id, lat: loc.lat, lng: loc.lng, startedAt: now, lastSeenAt: now, liveUntil: new Date(now.getTime() + secs * 1000) })
    .onConflictDoNothing()
    .returning();
  if (!f) return { started: false, near };
  // one public "X is floating" per person per day, however often they toggle
  if (await once(db, `float-announce:${user.id}:${istDay(now)}`)) await n.announce(pick(LINES.floatStart, { name: esc(user.name), near }));
  // open requests nearby in the next hour
  const reqs = await db
    .select({ p: plans, u: users })
    .from(plans)
    .innerJoin(users, eq(plans.userId, users.id))
    .where(and(eq(plans.kind, "request"), eq(plans.status, "open"), lt(plans.departAt, new Date(now.getTime() + 3600_000)), gt(plans.departAt, new Date(now.getTime() - 15 * 60_000))));
  let told = 0;
  for (const { p, u } of reqs) {
    const from = placeById(p.fromPlace);
    if (u.id === user.id || !located(from) || distanceM(loc, from) > FLOAT_RADIUS_M || told >= 3) continue;
    if (await pingFloater(db, n, user, f, p, u, now)) told++;
  }
  return { started: true, near };
}

/** End a float and pay for it: floating hours only, minus forfeited minutes, within the daily cap. Safe to call twice. */
export async function endFloat(db: Db, n: Notifier, f: Float, now: Date, why?: string) {
  const end = new Date(Math.min(now.getTime(), f.liveUntil.getTime()));
  const res = await db.transaction(async (tx) => {
    const done = await tx.update(floats).set({ endedAt: end }).where(and(eq(floats.id, f.id), isNull(floats.endedAt))).returning();
    if (!done.length) return null;
    const minutes = Math.round((end.getTime() - f.startedAt.getTime()) / 60_000);
    const paidMinutes = Math.max(0, floatableMinutes(f.startedAt, end) - done[0].forfeitMinutes);
    const today = await earnedToday(tx, f.userId, "float", now);
    const got = await award(tx, f.userId, floatKaju(paidMinutes, today.sum), "float", `float:${f.id}`, now);
    // pings still waiting die with the float, unanswered → no penalty beyond the float ending
    await tx.update(floatPings).set({ outcome: "released", resolvedAt: now }).where(and(eq(floatPings.floatId, f.id), eq(floatPings.outcome, "pending")));
    return { minutes, got };
  });
  if (res && res.minutes >= 15 && !why?.startsWith("refused")) {
    const [u] = await db.select().from(users).where(eq(users.id, f.userId));
    const extra = why === "left the village" ? "\n<i>(You left the village map, so I ended your float.)</i>" : "";
    await n.dm({ to: u.telegramId, text: pick(LINES.floatThanks, { minutes: res.minutes, kaju: res.got }) + extra });
  }
  return res;
}

export async function stopFloat(db: Db, n: Notifier, user: User, now: Date) {
  const [active] = await db.select().from(floats).where(and(eq(floats.userId, user.id), isNull(floats.endedAt)));
  return active ? endFloat(db, n, active, now) : null;
}

/** A floater turned a request down (or let it lapse). They weren't really floating: −10, the last hour unpaid, float over. */
export async function floaterRefused(db: Db, n: Notifier, userId: number, requestId: number, now: Date, how: "refused" | "missed") {
  const r = await db.transaction(async (tx) => {
    const [ping] = await tx
      .select()
      .from(floatPings)
      .where(and(eq(floatPings.userId, userId), eq(floatPings.requestId, requestId), eq(floatPings.outcome, "pending")))
      .for("update");
    if (!ping) return null;
    await tx.update(floatPings).set({ outcome: how, resolvedAt: now }).where(eq(floatPings.id, ping.id));
    const [f] = await tx.select().from(floats).where(eq(floats.id, ping.floatId)).for("update");
    if (!f || f.endedAt) return null;
    await tx.update(floats).set({ forfeitMinutes: f.forfeitMinutes + KAJU.floaterRefusalForfeitMin }).where(eq(floats.id, f.id));
    const lost = await award(tx, userId, KAJU.floaterRefusal, "floater_refusal", `ping:${ping.id}`, now);
    return { f, lost };
  });
  if (!r) return null;
  const ended = await endFloat(db, n, r.f, now, "refused");
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  await n.dm({
    to: u.telegramId,
    text: `${how === "missed" ? "No answer, so I'm guessing" : "No worries,"} you weren't really free. 🌴 I've ended your float: ${r.lost} kaju, and the last hour isn't paid${ended ? ` (+${ended.got} for the rest)` : ""}.\nShare your live location again when you're truly free to pick people up.`,
  });
  return { lost: r.lost, paid: ended?.got ?? 0 };
}

export async function refuseRequest(db: Db, n: Notifier, user: User, requestId: number, now: Date) {
  const r = await floaterRefused(db, n, user.id, requestId, now, "refused");
  if (!r) throw new GameError("Nothing to refuse there: that request is already sorted.");
  return r;
}

/** Ticker: pings nobody answered while the request stayed open count as refusals; others are released. */
export async function resolvePings(db: Db, n: Notifier, now: Date) {
  const due = await db
    .select({ ping: floatPings, req: plans })
    .from(floatPings)
    .innerJoin(plans, eq(floatPings.requestId, plans.id))
    .where(and(eq(floatPings.outcome, "pending"), lt(floatPings.pingedAt, new Date(now.getTime() - KAJU.floaterAnswerMin * 60_000))));
  for (const { ping, req } of due) {
    if (req.status === "open") await floaterRefused(db, n, ping.userId, req.id, now, "missed");
    else await db.update(floatPings).set({ outcome: "released", resolvedAt: now }).where(and(eq(floatPings.id, ping.id), eq(floatPings.outcome, "pending")));
  }
}

/** Ticker: quiet floats get asked "still floating?"; unanswered ones end where the question was asked. */
export async function checkQuietFloats(db: Db, n: Notifier, now: Date) {
  const quiet = await db
    .select({ f: floats, u: users })
    .from(floats)
    .innerJoin(users, eq(floats.userId, users.id))
    .where(and(isNull(floats.endedAt), isNull(floats.checkedAt), lt(floats.lastSeenAt, new Date(now.getTime() - CHECK_AFTER_MIN * 60_000))));
  for (const { f, u } of quiet) {
    await db.update(floats).set({ checkedAt: now }).where(eq(floats.id, f.id));
    await n.dm({
      to: u.telegramId,
      text: "🌴 Still floating? I haven't seen you move in a while.",
      buttons: [[{ text: "🌴 Still here", data: "still" }, { text: "Stop floating", data: "stopfloat" }]],
    });
  }
  const gone = await db
    .select()
    .from(floats)
    .where(and(isNull(floats.endedAt), isNotNull(floats.checkedAt), lt(floats.checkedAt, new Date(now.getTime() - CHECK_GRACE_MIN * 60_000))));
  for (const f of gone) await endFloat(db, n, f, f.checkedAt!);
}

export async function stillHere(db: Db, user: User, now: Date) {
  const r = await db
    .update(floats)
    .set({ lastSeenAt: now, checkedAt: null })
    .where(and(eq(floats.userId, user.id), isNull(floats.endedAt), gt(floats.liveUntil, now)))
    .returning();
  return r.length > 0;
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

