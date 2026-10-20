import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { floats, kaju, plans, rides, users, type Plan, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { KAJU, maxSeats, planKaju } from "@/lib/kaju";
import { floaterNear, offerFitsRequest } from "@/lib/match";
import { destName, ERRAND, OPEN, placeById, placeName, tripLabel } from "@/lib/places";
import { istDay, istHHMM } from "@/lib/time";
import { award, earnedToday } from "./kaju";
import { cancelRideInTx, type Effects } from "./rides";
import { pingFloater } from "./floats";
import { once } from "./once";
import { assertActive } from "./roles";

export { GameError } from "./errors";
import { GameError } from "./errors";

export type NewPlan = { kind: "offer" | "request"; fromPlace: string; toPlace: string; departAt: Date; seats?: number; note?: string; rangeKm?: number | null };

export function validatePlan(input: NewPlan, now: Date, seatCap = 1) {
  if (input.kind !== "offer" && input.kind !== "request") throw new GameError("Pilot or hitcher?");
  if (!placeById(input.fromPlace) || !placeById(input.toPlace) || input.fromPlace === ERRAND.id || input.fromPlace === OPEN.id) throw new GameError("Pick places from the list.");
  const open = input.toPlace === OPEN.id;
  if (open && !(input.rangeKm && input.rangeKm >= 1 && input.rangeKm <= 20)) throw new GameError("Roughly how far from the pickup? Pick 2, 5, 10 or 15 km.");
  if (input.toPlace === ERRAND.id && input.kind === "offer") throw new GameError("Errands are for asking a floater. Going somewhere? Pick where.");
  if (input.fromPlace === input.toPlace) throw new GameError("That's where you already are!");
  const t = input.departAt.getTime();
  if (Number.isNaN(t) || t < now.getTime() - 10 * 60_000) throw new GameError("That time has already gone by.");
  if (t > now.getTime() + 36 * 3600_000) throw new GameError("Plans can be up to a day and a half ahead.");
  const seats = input.kind === "offer" ? Math.min(Math.max(1, seatCap), Math.max(1, input.seats ?? 1)) : 1;
  return { ...input, seats, rangeKm: open ? Math.round(input.rangeKm!) : null, note: input.note?.replace(/[<>&]/g, "").trim().slice(0, 120) || null };
}

const offerButtons = (offerId: number) => [[{ text: "🛵 Hop on", data: `hop:${offerId}` }]];
const takeButtons = (requestId: number) => [[{ text: "🙋 I'll take them", data: `take:${requestId}` }]];

/** Post a plan, pay its kaju, and ping the people who could match it. */
export async function createPlan(db: Db, n: Notifier, user: User, input: NewPlan, now: Date) {
  assertActive(user);
  const v = validatePlan(input, now, maxSeats(user.vehicle));
  const lead = Math.max(0, Math.round((v.departAt.getTime() - now.getTime()) / 60_000));
  const { plan, got } = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({ userId: user.id, kind: v.kind, fromPlace: v.fromPlace, toPlace: v.toPlace, departAt: v.departAt, leadMinutes: lead, seats: v.seats, note: v.note, rangeKm: v.rangeKm, createdAt: now })
      .returning();
    const today = await earnedToday(tx, user.id, "plan", now);
    const got = today.count < KAJU.planAwardsPerDay ? await award(tx, user.id, planKaju(lead), "plan", `plan:${plan.id}`, now) : 0;
    return { plan, got };
  });

  const when = istHHMM(plan.departAt);
  if (lead >= 120 && got > 0 && (await once(db, `earlybird:${user.id}:${istDay(now)}`))) {
    await n.announce(pick(LINES.earlyBird, { name: esc(user.name), to: esc(destName(plan.toPlace, plan.note, plan.rangeKm)), time: when, hoursAhead: Math.floor(lead / 60) }));
  }
  const pinged = await pingMatches(db, n, user, plan, now);
  return { plan, kaju: got, pinged };
}

/** DM everyone who could match this plan. Returns how many people were pinged. */
export async function pingMatches(db: Db, n: Notifier, owner: User, plan: Plan, now: Date) {
  const vals = { name: esc(owner.name), from: esc(placeName(plan.fromPlace)), to: esc(destName(plan.toPlace, plan.note, plan.rangeKm)), time: istHHMM(plan.departAt) };
  const trip = tripLabel(plan.fromPlace, plan.toPlace, plan.rangeKm);
  const howFar = trip ? `\n<i>🧭 ${trip} from the pickup${plan.toPlace === OPEN.id ? "; they'll say exactly where" : ""}.</i>` : "";
  const open = await db
    .select({ p: plans, u: users })
    .from(plans)
    .innerJoin(users, eq(plans.userId, users.id))
    .where(and(eq(plans.status, "open"), ne(plans.userId, owner.id), gt(plans.departAt, new Date(now.getTime() - 10 * 60_000))));
  const told = new Set<number>();
  if (plan.kind === "request") {
    for (const { p, u } of open) {
      if (offerFitsRequest(p, plan) && !told.has(u.id)) {
        told.add(u.id);
        await n.dm({ to: u.telegramId, text: pick(LINES.rideWanted, vals) + howFar, buttons: takeButtons(plan.id) });
      }
    }
    // floaters near the pickup, for rides in the next hour
    if (plan.departAt.getTime() - now.getTime() <= 60 * 60_000) {
      const fl = await db.select({ f: floats, u: users }).from(floats).innerJoin(users, eq(floats.userId, users.id)).where(isNull(floats.endedAt));
      for (const { f, u } of fl) {
        if (u.id !== owner.id && !told.has(u.id) && floaterNear(f, plan.fromPlace, now)) {
          told.add(u.id);
          await pingFloater(db, n, u, f, plan, owner, now);
        }
      }
    }
  } else {
    for (const { p, u } of open) {
      if (offerFitsRequest(plan, p) && !told.has(u.id)) {
        told.add(u.id);
        await n.dm({ to: u.telegramId, text: pick(LINES.seatOffered, vals) + howFar, buttons: offerButtons(plan.id) });
      }
    }
  }
  return told.size;
}

/** Cancel your own plan. Rides on it are cancelled too (late ones cost kaju). */
export async function cancelPlan(db: Db, n: Notifier, user: User, planId: number, now: Date) {
  const effects: Effects = [];
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(plans).where(eq(plans.id, planId)).for("update");
    if (!p || p.userId !== user.id) throw new GameError("That isn't your plan.");
    if (p.status === "cancelled" || p.status === "done" || p.status === "expired") throw new GameError("That plan is already closed.");
    await tx.update(plans).set({ status: "cancelled" }).where(eq(plans.id, planId));
    // a plan nobody ever rode on gives its kaju back (no post-cancel-repost farming)
    const everRode = await tx.select({ id: rides.id }).from(rides).where(or(eq(rides.offerId, planId), eq(rides.requestId, planId))).limit(1);
    if (!everRode.length) {
      const [paid] = await tx.select({ s: sql<number>`coalesce(sum(${kaju.amount}), 0)::int` }).from(kaju).where(and(eq(kaju.userId, user.id), eq(kaju.ref, `plan:${planId}`), eq(kaju.reason, "plan")));
      if (paid?.s) await award(tx, user.id, -paid.s, "plan_cancel", `plan:${planId}`, now);
    }
    const live = await tx
      .select()
      .from(rides)
      .where(and(eq(rides.status, "matched"), p.kind === "offer" ? eq(rides.offerId, planId) : eq(rides.requestId, planId)));
    for (const r of live) effects.push(...(await cancelRideInTx(tx, user, r, now, { reopenOwn: false })));
  });
  for (const e of effects) await e(n);
}

export async function openPlans(db: Db, now: Date) {
  return db
    .select({ plan: plans, user: users })
    .from(plans)
    .innerJoin(users, eq(plans.userId, users.id))
    .where(and(inArray(plans.status, ["open"]), gt(plans.departAt, new Date(now.getTime() - 15 * 60_000))))
    .orderBy(plans.departAt);
}

export async function myPlans(db: Db, userId: number, now: Date) {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), inArray(plans.status, ["open", "full"]), gt(plans.departAt, new Date(now.getTime() - 3 * 3600_000))))
    .orderBy(plans.departAt);
}

/** Open plans whose time is long gone quietly expire. */
export async function expirePlans(db: Db, now: Date) {
  await db
    .update(plans)
    .set({ status: "expired" })
    .where(and(eq(plans.status, "open"), lt(plans.departAt, new Date(now.getTime() - 60 * 60_000))));
}
