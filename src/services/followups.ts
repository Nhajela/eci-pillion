import { and, eq, gt, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { floatPings, floats, plans, rides, users, type Plan, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { istDay, istHHMM, istMinuteOfDay } from "@/lib/time";
import { distanceM, located, placeById, placeName, destName, tripLabel, OPEN, ERRAND, pickupNear } from "@/lib/places";
import { offerFitsRequest, MATCH_WINDOW_MIN } from "@/lib/match";
import { once } from "./once";

// An ask nobody has taken after 10 minutes gets one more round: pilots a little further (in time and place),
// floaters a little further, and a gentle nudge to people with wheels who aren't floating.

export const FOLLOW_UP = {
  afterMin: 10, // the ask has been open this long
  withinMin: 120, // and leaves within this
  wideWindowMin: 90, // offers this far in time (normal matching: 45)
  wideDestM: 1500, // destinations this close (normal: 600 m)
  wideFloatM: 6000, // floaters this far from the pickup (normal: 3 km)
  nudgesPerAsk: 8,
  nudgesPerPersonPerDay: 2,
  activeDays: 7, // only nudge people who used Pillion this week
};

const takeButton = (id: number) => [[{ text: "🛵 I'll take them", data: `take:${id}` }]];

/** A wider fit than normal matching: ±90 min, destinations within 1.5 km (open asks: pickups within 4 km). */
function wideFit(offer: Plan, req: Plan) {
  if (offer.userId === req.userId || offer.seats < 1) return false;
  if (Math.abs(offer.departAt.getTime() - req.departAt.getTime()) > FOLLOW_UP.wideWindowMin * 60_000) return false;
  if (req.toPlace === ERRAND.id) return false;
  if (req.toPlace === OPEN.id || offer.toPlace === OPEN.id) {
    const a = placeById(offer.fromPlace);
    const b = placeById(req.fromPlace);
    return pickupNear(offer.fromPlace, req.fromPlace) || (located(a) && located(b) && distanceM(a, b) <= 4000);
  }
  if (offer.toPlace === req.toPlace) return true;
  const a = placeById(offer.toPlace);
  const b = placeById(req.toPlace);
  return located(a) && located(b) && distanceM(a, b) <= FOLLOW_UP.wideDestM;
}

/** Ticker: one follow-up round per ask that's still waiting. Returns how many people were messaged. */
export async function followUpAsks(db: Db, n: Notifier, now: Date) {
  const m = istMinuteOfDay(now);
  if (m < 7 * 60 || m >= 22 * 60) return 0; // nobody gets nudged at night
  const asks = await db
    .select({ p: plans, u: users })
    .from(plans)
    .innerJoin(users, eq(plans.userId, users.id))
    .where(and(
      eq(plans.kind, "request"), eq(plans.status, "open"),
      lt(plans.createdAt, new Date(now.getTime() - FOLLOW_UP.afterMin * 60_000)),
      gt(plans.departAt, new Date(now.getTime() - 10 * 60_000)),
      lt(plans.departAt, new Date(now.getTime() + FOLLOW_UP.withinMin * 60_000)),
    ));
  let told = 0;
  for (const { p: req, u: asker } of asks) {
    if (!(await once(db, `followup:${req.id}`))) continue;
    told += await followUp(db, n, req, asker, now);
  }
  return told;
}

async function followUp(db: Db, n: Notifier, req: Plan, asker: User, now: Date) {
  const vals = `<b>${esc(asker.name)}</b> needs a ride: ${esc(placeName(req.fromPlace))} → <b>${esc(destName(req.toPlace, req.note, req.rangeKm))}</b> around <b>${istHHMM(req.departAt)}</b>`;
  const trip = tripLabel(req.fromPlace, req.toPlace, req.rangeKm);
  const howFar = trip ? `\n<i>🧭 ${trip} from the pickup.</i>` : "";
  const skip = new Set<number>([asker.id]);
  let told = 0;

  // 1. pilots a little further in time or place (the ones normal matching already pinged are skipped)
  const offers = await db.select({ p: plans, u: users }).from(plans).innerJoin(users, eq(plans.userId, users.id))
    .where(and(eq(plans.kind, "offer"), eq(plans.status, "open"), ne(plans.userId, asker.id)));
  for (const { p, u } of offers) {
    if (skip.has(u.id) || u.role === "blocked") continue;
    if (offerFitsRequest(p, req)) { skip.add(u.id); continue; } // already pinged when the ask was posted
    if (!wideFit(p, req)) continue;
    skip.add(u.id);
    if (!(await once(db, `ask-ping:${req.id}:${u.id}`))) continue;
    await n.dm({ to: u.telegramId, text: `🛵 Nobody's taken this one yet, and it's close to your ride at ${istHHMM(p.departAt)}:\n${vals}.${howFar}`, buttons: takeButton(req.id) });
    told++;
  }

  // 2. floaters a little further away (no penalty for these: they're outside the usual radius)
  const pinged = await db.select({ userId: floatPings.userId }).from(floatPings).where(eq(floatPings.requestId, req.id));
  for (const x of pinged) skip.add(x.userId);
  const fl = await db.select({ f: floats, u: users }).from(floats).innerJoin(users, eq(floats.userId, users.id))
    .where(and(isNull(floats.endedAt), gt(floats.liveUntil, now)));
  const from = placeById(req.fromPlace);
  const busy = await busyAround(db, req.departAt);
  for (const { f, u } of fl) {
    if (skip.has(u.id) || busy.has(u.id) || !located(from) || distanceM(f, from) > FOLLOW_UP.wideFloatM) continue;
    skip.add(u.id);
    if (!(await once(db, `ask-ping:${req.id}:${u.id}`))) continue;
    await n.dm({ to: u.telegramId, text: `🌴 A little further than usual, but nobody's taken it:\n${vals}.${howFar}\n<i>No pressure: this one's outside your floating radius.</i>`, buttons: takeButton(req.id) });
    told++;
  }

  // 3. a nudge to people with wheels who used Pillion this week and are free then
  const since = new Date(now.getTime() - FOLLOW_UP.activeDays * 86400_000);
  const floatingIds = new Set(fl.map((x) => x.u.id));
  const wheels = await db.select().from(users).where(and(
    ne(users.vehicle, "none"), ne(users.role, "blocked"), sql`${users.onboardedAt} is not null`,
    or(gte(users.onboardedAt, since), sql`exists (select 1 from plans q where q.user_id = "users"."id" and q.created_at >= ${since.toISOString()})`),
  ));
  let nudged = 0;
  const day = istDay(now);
  for (const u of wheels) {
    if (nudged >= FOLLOW_UP.nudgesPerAsk) break;
    if (skip.has(u.id) || floatingIds.has(u.id) || busy.has(u.id)) continue;
    let slot = -1;
    for (let k = 0; k < FOLLOW_UP.nudgesPerPersonPerDay && slot < 0; k++) if (await once(db, `nudge:${u.id}:${day}:${k}`)) slot = k;
    if (slot < 0) continue; // had today's nudges already
    skip.add(u.id);
    await n.dm({ to: u.telegramId, text: `🙋 ${vals}, and nobody's taken it yet.${howFar}\nFree and on wheels? One tap:`, buttons: takeButton(req.id) });
    nudged++;
    told++;
  }
  return told;
}

/** People with a matched ride around `t` (they couldn't take another). */
async function busyAround(db: Db, t: Date) {
  const W = MATCH_WINDOW_MIN * 60_000;
  const rs = await db.select({ p: rides.pilotId, h: rides.hitcherId }).from(rides)
    .where(and(eq(rides.status, "matched"), gt(rides.departAt, new Date(t.getTime() - W)), lt(rides.departAt, new Date(t.getTime() + W))));
  return new Set(rs.flatMap((r) => [r.p, r.h]));
}

export const _wideFit = wideFit;
