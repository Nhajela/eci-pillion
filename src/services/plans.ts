import { and, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { floats, plans, rides, users, type Plan, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { KAJU, maxSeats, planKaju } from "@/lib/kaju";
import { floaterNear, offerFitsRequest } from "@/lib/match";
import { placeById, placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { award, earnedToday } from "./kaju";
import { cancelRideInTx, type Effects } from "./rides";

export class GameError extends Error {}

export type NewPlan = { kind: "offer" | "request"; fromPlace: string; toPlace: string; departAt: Date; seats?: number; note?: string };

export function validatePlan(input: NewPlan, now: Date, seatCap = 1) {
  if (input.kind !== "offer" && input.kind !== "request") throw new GameError("Pilot or hitcher?");
  if (!placeById(input.fromPlace) || !placeById(input.toPlace)) throw new GameError("Pick places from the list.");
  if (input.fromPlace === input.toPlace) throw new GameError("That's where you already are!");
  const t = input.departAt.getTime();
  if (Number.isNaN(t) || t < now.getTime() - 10 * 60_000) throw new GameError("That time has already gone by.");
  if (t > now.getTime() + 36 * 3600_000) throw new GameError("Plans can be up to a day and a half ahead.");
  const seats = input.kind === "offer" ? Math.min(Math.max(1, seatCap), Math.max(1, input.seats ?? 1)) : 1;
  return { ...input, seats, note: input.note?.trim().slice(0, 120) || null };
}

const offerButtons = (offerId: number) => [[{ text: "🛵 Hop on", data: `hop:${offerId}` }]];
const takeButtons = (requestId: number) => [[{ text: "🙋 I'll take them", data: `take:${requestId}` }]];

/** Post a plan, pay its kaju, and ping the people who could match it. */
export async function createPlan(db: Db, n: Notifier, user: User, input: NewPlan, now: Date) {
  const v = validatePlan(input, now, maxSeats(user.vehicle));
  const lead = Math.max(0, Math.round((v.departAt.getTime() - now.getTime()) / 60_000));
  const { plan, got } = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({ userId: user.id, kind: v.kind, fromPlace: v.fromPlace, toPlace: v.toPlace, departAt: v.departAt, leadMinutes: lead, seats: v.seats, note: v.note, createdAt: now })
      .returning();
    const today = await earnedToday(tx, user.id, "plan", now);
    const got = today.count < KAJU.planAwardsPerDay ? await award(tx, user.id, planKaju(lead), "plan", `plan:${plan.id}`, now) : 0;
    return { plan, got };
  });

  const when = istHHMM(plan.departAt);
  if (lead >= 120 && got > 0) {
    await n.announce(pick(LINES.earlyBird, { name: esc(user.name), to: placeName(plan.toPlace), time: when, hoursAhead: Math.floor(lead / 60) }));
  }
  const pinged = await pingMatches(db, n, user, plan, now);
  return { plan, kaju: got, pinged };
}

/** DM everyone who could match this plan. Returns how many people were pinged. */
export async function pingMatches(db: Db, n: Notifier, owner: User, plan: Plan, now: Date) {
  const vals = { name: esc(owner.name), from: placeName(plan.fromPlace), to: placeName(plan.toPlace), time: istHHMM(plan.departAt) };
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
        await n.dm({ to: u.telegramId, text: pick(LINES.rideWanted, vals), buttons: takeButtons(plan.id) });
      }
    }
    // floaters near the pickup, for rides in the next hour
    if (plan.departAt.getTime() - now.getTime() <= 60 * 60_000) {
      const fl = await db.select({ f: floats, u: users }).from(floats).innerJoin(users, eq(floats.userId, users.id)).where(isNull(floats.endedAt));
      for (const { f, u } of fl) {
        if (u.id !== owner.id && !told.has(u.id) && floaterNear(f, plan.fromPlace, now)) {
          told.add(u.id);
          await n.dm({ to: u.telegramId, text: pick(LINES.rideWanted, vals), buttons: takeButtons(plan.id) });
        }
      }
    }
  } else {
    for (const { p, u } of open) {
      if (offerFitsRequest(plan, p) && !told.has(u.id)) {
        told.add(u.id);
        await n.dm({ to: u.telegramId, text: pick(LINES.seatOffered, vals), buttons: offerButtons(plan.id) });
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
