import { and, desc, eq, gte, inArray, isNull, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { announcements, floats, kaju, places, plans, rides, users } from "@/db/schema";
import { everyPlace } from "@/lib/places";
import { istDay, istDayStart } from "@/lib/time";
import { KAJU } from "@/lib/kaju";
import { loadPlaces } from "./places";
import { listReports } from "./reports";

/** Signals of fake accounts or kaju farming, for a human to look at (nothing is automatic). */
async function watchList(db: Db, now: Date, nameOf: (id: number) => string) {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [pairs, bursts, fresh] = await Promise.all([
    db.select({ a: sql<number>`least(${rides.pilotId}, ${rides.hitcherId})`, b: sql<number>`greatest(${rides.pilotId}, ${rides.hitcherId})`, n: sql<number>`count(*)::int` })
      .from(rides).where(eq(rides.status, "done")).groupBy(sql`1, 2`).having(sql`count(*) >= 3`),
    db.select({ id: users.invitedBy, n: sql<number>`count(*)::int` }).from(users)
      .where(and(gte(users.onboardedAt, dayAgo), sql`${users.invitedBy} is not null`)).groupBy(users.invitedBy).having(sql`count(*) >= 3`),
    db.select({ id: users.id, n: sql<number>`count(${rides.id})::int` }).from(users)
      .innerJoin(rides, sql`(${rides.pilotId} = ${users.id} or ${rides.hitcherId} = ${users.id}) and ${rides.status} in ('matched', 'done')`)
      .where(gte(users.onboardedAt, new Date(now.getTime() - 48 * 3600_000))).groupBy(users.id).having(sql`count(${rides.id}) >= 2`),
  ]);
  return [
    ...pairs.map((p) => `${nameOf(p.a)} and ${nameOf(p.b)} have ridden together ${p.n} times (kaju pays for ${KAJU.pairRidesPerDay} a day).`),
    ...bursts.map((b) => `${nameOf(b.id!)} brought ${b.n} sign-ups in the last 24 h.`),
    ...fresh.map((f) => `${nameOf(f.id)} joined in the last 48 h and already has ${f.n} rides.`),
  ];
}

/** Everything the staff and admin dashboards show, in one read. */
export async function dashboard(db: Db, now: Date) {
  await loadPlaces(db, true);
  const dayStart = istDayStart(now);
  const day = istDay(now);
  const [
    [people], [joinedToday], [plansToday], [ridesDoneToday], [kajuToday], board, upcoming, floating, everyoneRows, reports, usage, placeRows, totals, said,
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
    db.select().from(users).orderBy(desc(users.createdAt)),
    listReports(db),
    db.select({ id: plans.toPlace, c: sql<number>`count(*)::int` }).from(plans).groupBy(plans.toPlace),
    db.select({ id: places.id, addedBy: places.addedBy, createdAt: places.createdAt }).from(places),
    db.select({ userId: kaju.userId, k: sql<number>`coalesce(sum(${kaju.amount}), 0)::int` }).from(kaju).groupBy(kaju.userId),
    db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(30),
  ]);
  const kajuOf = new Map(totals.map((t) => [t.userId, t.k]));
  const everyone = everyoneRows.map((u) => ({ u, k: kajuOf.get(u.id) ?? 0 }));
  const ids = [...new Set(upcoming.flatMap((r) => [r.pilotId, r.hitcherId]))];
  const rideUsers = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const nameOf = (id: number | null) => (id == null ? "" : everyone.find((e) => e.u.id === id)?.u.name ?? rideUsers.find((u) => u.id === id)?.name ?? "?");
  const uses = new Map(usage.map((u) => [u.id, u.c]));
  const watch = await watchList(db, now, (id) => nameOf(id));
  return {
    stats: {
      people: people.c, joinedToday: joinedToday.c, plansToday: plansToday.c, ridesDoneToday: ridesDoneToday.c,
      kajuToday: kajuToday.c, floatingNow: floating.length, openReports: reports.filter((r) => r.r.status === "new" || r.r.status === "doing").length,
    },
    board,
    announcements: said,
    watch,
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
