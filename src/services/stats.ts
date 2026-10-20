import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { floats, kaju, plans, rides, users } from "@/db/schema";
import { esc, gifUrl, type Notifier } from "@/bot/telegram";
import { istDayStart } from "@/lib/time";
import { once } from "./once";

// The village's public numbers: the board, the landing page's pulse, milestones.

export const MILESTONES = [1, 10, 25, 50, 100, 150, 200, 300, 500];
export const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 100) * 100;

const count = sql<number>`count(*)::int`;
const friend = alias(users, "friend");

/** Village totals, all-time and today. Cheap enough for every page view at village scale. */
export async function pulse(db: Db, now: Date) {
  const start = istDayStart(now);
  const [[done], [doneToday], [riders], [pilots], [askers], [joined], [asking], [seats], [floating], [kajuAll]] = await Promise.all([
    db.select({ n: count }).from(rides).where(eq(rides.status, "done")),
    db.select({ n: count }).from(rides).where(and(eq(rides.status, "done"), gte(rides.completedAt, start))),
    db.select({ n: sql<number>`count(distinct x)::int` }).from(sql`(select pilot_id as x from rides where status = 'done' union select hitcher_id from rides where status = 'done') t`),
    db.select({ n: sql<number>`count(distinct ${rides.pilotId})::int` }).from(rides).where(eq(rides.status, "done")),
    db.select({ n: sql<number>`count(distinct ${plans.userId})::int` }).from(plans).where(eq(plans.kind, "request")),
    db.select({ n: count }).from(users).where(sql`${users.onboardedAt} is not null`),
    db.select({ n: count }).from(plans).where(and(eq(plans.kind, "request"), eq(plans.status, "open"), gt(plans.departAt, new Date(now.getTime() - 15 * 60_000)))),
    db.select({ n: sql<number>`coalesce(sum(${plans.seats}), 0)::int` }).from(plans).where(and(eq(plans.kind, "offer"), eq(plans.status, "open"), gt(plans.departAt, new Date(now.getTime() - 15 * 60_000)))),
    db.select({ n: count }).from(floats).where(and(isNull(floats.endedAt), gt(floats.liveUntil, now))),
    db.select({ n: sql<number>`coalesce(sum(${kaju.amount}) filter (where ${kaju.amount} > 0), 0)::int` }).from(kaju),
  ]);
  return {
    rides: done.n, ridesToday: doneToday.n, riders: riders.n, pilots: pilots.n, askers: askers.n, people: joined.n,
    askingNow: asking.n, seatsNow: seats.n, floatingNow: floating.n, kaju: kajuAll.n, next: nextMilestone(done.n),
  };
}

export type FeedItem = { id: number; at: Date; pilot: Face; hitcher: Face; vehicle: string; from: string; to: string; rangeKm: number | null; viaFloat: boolean };
type Face = { id: number; name: string; avatar: string | null; scooty: string };

/** The rides that happened, newest first. */
export async function recentRides(db: Db, limit = 20): Promise<FeedItem[]> {
  const rs = await db.select().from(rides).where(eq(rides.status, "done")).orderBy(desc(rides.completedAt)).limit(limit);
  const ids = [...new Set(rs.flatMap((r) => [r.pilotId, r.hitcherId]))];
  const us = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const face = (id: number): Face => {
    const u = us.find((x) => x.id === id);
    return { id, name: u?.name ?? "someone", avatar: u?.avatar ?? null, scooty: u?.scooty ?? "#7fd1b9" };
  };
  return rs.map((r) => ({
    id: r.id, at: r.completedAt ?? r.departAt, pilot: face(r.pilotId), hitcher: face(r.hitcherId),
    vehicle: us.find((u) => u.id === r.pilotId)?.vehicle ?? "scooty", from: r.fromPlace, to: r.toPlace, rangeKm: r.rangeKm, viaFloat: r.viaFloat,
  }));
}

/** All-time leaders: generous pilots, hitchers, inviters, floaters. */
export async function leaders(db: Db, limit = 5) {
  const top = (rows: { id: number; name: string; avatar: string | null; scooty: string; n: number }[]) => rows.filter((r) => r.n > 0);
  const [pilots, hitchers, inviters, floaters] = await Promise.all([
    db.select({ id: users.id, name: users.name, avatar: users.avatar, scooty: users.scooty, n: count })
      .from(rides).innerJoin(users, eq(rides.pilotId, users.id)).where(eq(rides.status, "done")).groupBy(users.id).orderBy(desc(count)).limit(limit),
    db.select({ id: users.id, name: users.name, avatar: users.avatar, scooty: users.scooty, n: count })
      .from(rides).innerJoin(users, eq(rides.hitcherId, users.id)).where(eq(rides.status, "done")).groupBy(users.id).orderBy(desc(count)).limit(limit),
    db.select({ id: users.id, name: users.name, avatar: users.avatar, scooty: users.scooty, n: sql<number>`count(${friend.id})::int` })
      .from(users).innerJoin(friend, eq(friend.invitedBy, users.id)).where(isNotNull(friend.onboardedAt))
      .groupBy(users.id).orderBy(desc(sql`count(${friend.id})`)).limit(limit),
    db.select({ id: users.id, name: users.name, avatar: users.avatar, scooty: users.scooty, n: sql<number>`coalesce(sum(${kaju.amount}), 0)::int` })
      .from(kaju).innerJoin(users, eq(kaju.userId, users.id)).where(eq(kaju.reason, "float")).groupBy(users.id).orderBy(desc(sql`sum(${kaju.amount})`)).limit(limit),
  ]);
  return { pilots: top(pilots), hitchers: top(hitchers), inviters: top(inviters), floaters: top(floaters) };
}

/** Where the village goes: the most-chosen destinations (named places only), all time. */
export async function topDestinations(db: Db, limit = 6) {
  const rows = await db
    .select({ id: plans.toPlace, n: count })
    .from(plans)
    .where(sql`${plans.toPlace} not in ('open', 'errand')`)
    .groupBy(plans.toPlace)
    .orderBy(desc(count))
    .limit(limit);
  return rows;
}

/** Open asks and seats right now, for the board (first names only, like the group announcements). */
export async function openBoard(db: Db, now: Date) {
  return db
    .select({ plan: plans, name: users.name, avatar: users.avatar, scooty: users.scooty, vehicle: users.vehicle })
    .from(plans)
    .innerJoin(users, eq(plans.userId, users.id))
    .where(and(eq(plans.status, "open"), gt(plans.departAt, new Date(now.getTime() - 15 * 60_000))))
    .orderBy(plans.departAt)
    .limit(30);
}

/** The flight board: everything leaving in the next hours (matched rides and open plans), with a status. */
export async function departures(db: Db, now: Date) {
  const from = new Date(now.getTime() - 30 * 60_000);
  const to = new Date(now.getTime() + 18 * 3600_000);
  const [rs, ps] = await Promise.all([
    db.select().from(rides).where(and(eq(rides.status, "matched"), gt(rides.departAt, from), lt(rides.departAt, to))),
    db.select({ plan: plans, name: users.name, vehicle: users.vehicle }).from(plans).innerJoin(users, eq(plans.userId, users.id))
      .where(and(eq(plans.status, "open"), gt(plans.departAt, from), lt(plans.departAt, to))),
  ]);
  const ids = [...new Set(rs.flatMap((r) => [r.pilotId, r.hitcherId]))];
  const us = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const nm = (id: number) => us.find((u) => u.id === id)?.name ?? "?";
  const status = (at: Date, kind: "ride" | "offer" | "request") => {
    const m = (at.getTime() - now.getTime()) / 60_000;
    if (kind === "ride") return m < -5 ? "DEPARTED" : m <= 15 ? "BOARDING" : "ON TIME";
    if (kind === "offer") return m < 0 ? "LEAVING" : "SEATS FREE";
    return m < 0 ? "STILL WAITING" : "SEEKING SEAT";
  };
  return [
    ...rs.map((r) => ({ at: r.departAt, from: r.fromPlace, to: r.toPlace, note: null as string | null, rangeKm: r.rangeKm, who: `${nm(r.pilotId)} + ${nm(r.hitcherId)}`, vehicle: us.find((u) => u.id === r.pilotId)?.vehicle ?? "scooty", status: status(r.departAt, "ride") })),
    ...ps.map(({ plan: p, name, vehicle }) => ({ at: p.departAt, from: p.fromPlace, to: p.toPlace, note: p.note, rangeKm: p.rangeKm, who: name, vehicle: p.kind === "offer" ? vehicle : "none", status: status(p.departAt, p.kind as "offer" | "request") + (p.kind === "offer" && p.seats > 1 ? ` ×${p.seats}` : "") })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Kaju leaders, all time and today (for the hidden board). */
export async function kajuLeaders(db: Db, now: Date, limit = 10) {
  const row = { id: users.id, name: users.name, avatar: users.avatar, scooty: users.scooty, n: sql<number>`sum(${kaju.amount})::int` };
  const [all, today] = await Promise.all([
    db.select(row).from(kaju).innerJoin(users, eq(kaju.userId, users.id)).groupBy(users.id).orderBy(desc(sql`sum(${kaju.amount})`)).limit(limit),
    db.select(row).from(kaju).innerJoin(users, eq(kaju.userId, users.id)).where(gte(kaju.createdAt, istDayStart(now))).groupBy(users.id).orderBy(desc(sql`sum(${kaju.amount})`)).limit(limit),
  ]);
  return { all, today };
}

/** After a ride is done: the village crossed a milestone (1st, 10th, 25th ride…)? Celebrate once in the group. */
export async function celebrateMilestone(db: Db, n: Notifier, pilotName: string, hitcherName: string) {
  const [done] = await db.select({ n: count }).from(rides).where(eq(rides.status, "done"));
  if (!MILESTONES.includes(done.n) || !(await once(db, `milestone:${done.n}`))) return null;
  const text = done.n === 1
    ? `🎉 <b>The very first Pillion ride happened!</b> ${esc(pilotName)} took ${esc(hitcherName)}. History, on a scooty.`
    : `🎉 <b>${done.n} rides shared in the village!</b> The ${done.n}th: ${esc(pilotName)} took ${esc(hitcherName)}. Next stop: ${nextMilestone(done.n)}.`;
  await n.announce(text, gifUrl("prizes"));
  return done.n;
}
