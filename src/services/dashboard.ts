import { and, desc, eq, gte, inArray, isNull, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { floats, kaju, places, plans, rides, users } from "@/db/schema";
import { everyPlace } from "@/lib/places";
import { istDay, istDayStart } from "@/lib/time";
import { loadPlaces } from "./places";
import { listReports } from "./reports";

/** Everything the staff and admin dashboards show, in one read. */
export async function dashboard(db: Db, now: Date) {
  await loadPlaces(db, true);
  const dayStart = istDayStart(now);
  const day = istDay(now);
  const [
    [people], [joinedToday], [plansToday], [ridesDoneToday], [kajuToday], board, upcoming, floating, everyone, reports, usage, placeRows,
  ] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(users).where(sql`${users.onboardedAt} is not null`),
    db.select({ c: sql<number>`count(*)::int` }).from(users).where(gte(users.onboardedAt, dayStart)),
    db.select({ c: sql<number>`count(*)::int` }).from(plans).where(gte(plans.createdAt, dayStart)),
    db.select({ c: sql<number>`count(*)::int` }).from(rides).where(and(eq(rides.status, "done"), gte(rides.completedAt, dayStart))),
    db.select({ c: sql<number>`coalesce(sum(${kaju.amount}), 0)::int` }).from(kaju).where(eq(kaju.day, day)),
    db.select({ plan: plans, user: users }).from(plans).innerJoin(users, eq(plans.userId, users.id))
      .where(and(eq(plans.status, "open"), gt(plans.departAt, new Date(now.getTime() - 60 * 60_000)))).orderBy(plans.departAt),
    db.select().from(rides).where(eq(rides.status, "matched")).orderBy(rides.departAt),
    db.select({ f: floats, u: users }).from(floats).innerJoin(users, eq(floats.userId, users.id)).where(and(isNull(floats.endedAt), gt(floats.liveUntil, now))),
    db.select({ u: users, k: sql<number>`coalesce((select sum(amount) from kaju where kaju.user_id = ${users.id}), 0)::int` })
      .from(users).orderBy(desc(users.createdAt)),
    listReports(db),
    db.select({ id: plans.toPlace, c: sql<number>`count(*)::int` }).from(plans).groupBy(plans.toPlace),
    db.select({ id: places.id, addedBy: places.addedBy, createdAt: places.createdAt }).from(places),
  ]);
  const ids = [...new Set(upcoming.flatMap((r) => [r.pilotId, r.hitcherId]))];
  const rideUsers = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const nameOf = (id: number | null) => (id == null ? "" : everyone.find((e) => e.u.id === id)?.u.name ?? rideUsers.find((u) => u.id === id)?.name ?? "?");
  const uses = new Map(usage.map((u) => [u.id, u.c]));
  return {
    stats: {
      people: people.c, joinedToday: joinedToday.c, plansToday: plansToday.c, ridesDoneToday: ridesDoneToday.c,
      kajuToday: kajuToday.c, floatingNow: floating.length, openReports: reports.filter((r) => r.r.status === "new" || r.r.status === "doing").length,
    },
    board,
    upcoming: upcoming.map((r) => ({ ...r, pilot: nameOf(r.pilotId), hitcher: nameOf(r.hitcherId) })),
    floating,
    people: everyone,
    reports,
    places: everyPlace().map((p) => {
      const row = placeRows.find((r) => r.id === p.id);
      return { ...p, uses: uses.get(p.id) ?? 0, addedBy: row?.addedBy ? nameOf(row.addedBy) : null };
    }),
  };
}
