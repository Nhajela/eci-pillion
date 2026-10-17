import { and, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { floats, kaju, plans, rides, users, type Ride, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { isLateCancel, KAJU, vehicleEmoji } from "@/lib/kaju";
import { offerFitsRequest } from "@/lib/match";
import { placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { award } from "./kaju";
import { GameError } from "./plans";

/** Messages to send after the transaction commits. */
export type Effects = ((n: Notifier) => Promise<void>)[];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const who = (u: User) =>
  u.username ? `<a href="https://t.me/${u.username}">${esc(u.name)}</a>` : `<a href="tg://user?id=${u.telegramId}">${esc(u.name)}</a>`;

function matchedEffects(ride: Ride, pilot: User, hitcher: User): Effects {
  const to = placeName(ride.toPlace);
  const from = placeName(ride.fromPlace);
  const time = istHHMM(ride.departAt);
  const cancel = [[{ text: "Can't make it", data: `cxr:${ride.id}` }]];
  return [
    (n) => n.dm({ to: pilot.telegramId, text: `${vehicleEmoji(pilot.vehicle)} You're taking ${who(hitcher)} from <b>${from}</b> to <b>${to}</b> around <b>${time}</b>. Say hi and sort the pickup spot.${pilot.vehicle === "car" ? "" : " Spare helmet?"}`, buttons: cancel }),
    (n) => n.dm({ to: hitcher.telegramId, text: `💞 ${who(pilot)} ${pilot.vehicle === "car" ? "(by car 🚗) " : ""}is taking you from <b>${from}</b> to <b>${to}</b> around <b>${time}</b>. Message them to sort the pickup spot.`, buttons: cancel }),
    (n) => n.announce(pick(LINES.match, { pilot: esc(pilot.name), hitcher: esc(hitcher.name), to, time })),
  ];
}

async function loadUsers(tx: Tx, a: number, b: number) {
  const rows = await tx.select().from(users).where(or(eq(users.id, a), eq(users.id, b)));
  return [rows.find((u) => u.id === a)!, rows.find((u) => u.id === b)!] as const;
}

/** A pilot (or floater) takes a hitcher's request. First tap wins. */
export async function takeRequest(db: Db, n: Notifier, pilot: User, requestId: number, now: Date) {
  const { ride, effects } = await db.transaction(async (tx) => {
    const [req] = await tx.select().from(plans).where(eq(plans.id, requestId)).for("update");
    if (!req || req.kind !== "request") throw new GameError("That ride request is gone.");
    if (req.userId === pilot.id) throw new GameError("You can't give yourself a ride (we checked).");
    if (req.status !== "open") throw new GameError("Someone beat you to it! Thanks for offering 💛");
    // attach the pilot's own matching offer, if they posted one
    const mine = await tx.select().from(plans).where(and(eq(plans.userId, pilot.id), eq(plans.kind, "offer"), eq(plans.status, "open")));
    const offer = mine.find((o) => offerFitsRequest(o, req));
    const [float] = await tx.select().from(floats).where(and(eq(floats.userId, pilot.id), isNull(floats.endedAt), gt(floats.liveUntil, now)));
    const [ride] = await tx
      .insert(rides)
      .values({ offerId: offer?.id ?? null, requestId: req.id, pilotId: pilot.id, hitcherId: req.userId, fromPlace: req.fromPlace, toPlace: req.toPlace, departAt: req.departAt, viaFloat: Boolean(float), createdAt: now })
      .returning();
    await tx.update(plans).set({ status: "full" }).where(eq(plans.id, req.id));
    if (offer) await tx.update(plans).set({ seats: offer.seats - 1, status: offer.seats - 1 > 0 ? "open" : "full" }).where(eq(plans.id, offer.id));
    const [p, h] = await loadUsers(tx, pilot.id, req.userId);
    return { ride, effects: matchedEffects(ride, p, h) };
  });
  for (const e of effects) await e(n);
  return ride;
}

/** A hitcher hops onto a pilot's offer. */
export async function hopOn(db: Db, n: Notifier, hitcher: User, offerId: number, now: Date) {
  const { ride, effects } = await db.transaction(async (tx) => {
    const [offer] = await tx.select().from(plans).where(eq(plans.id, offerId)).for("update");
    if (!offer || offer.kind !== "offer") throw new GameError("That seat is gone.");
    if (offer.userId === hitcher.id) throw new GameError("That's your own scooty!");
    const taken = await tx.select().from(rides).where(and(eq(rides.offerId, offerId), eq(rides.hitcherId, hitcher.id), eq(rides.status, "matched")));
    if (taken.length) throw new GameError("You're already on this one.");
    if (offer.status !== "open" || offer.seats < 1) throw new GameError("That seat just got taken. Post a request and we'll find you another!");
    const mine = await tx.select().from(plans).where(and(eq(plans.userId, hitcher.id), eq(plans.kind, "request"), eq(plans.status, "open")));
    const req = mine.find((r) => offerFitsRequest(offer, r));
    const [ride] = await tx
      .insert(rides)
      .values({ offerId: offer.id, requestId: req?.id ?? null, pilotId: offer.userId, hitcherId: hitcher.id, fromPlace: offer.fromPlace, toPlace: offer.toPlace, departAt: offer.departAt, createdAt: now })
      .returning();
    await tx.update(plans).set({ seats: offer.seats - 1, status: offer.seats - 1 > 0 ? "open" : "full" }).where(eq(plans.id, offer.id));
    if (req) await tx.update(plans).set({ status: "full" }).where(eq(plans.id, req.id));
    const [p, h] = await loadUsers(tx, offer.userId, hitcher.id);
    return { ride, effects: matchedEffects(ride, p, h) };
  });
  for (const e of effects) await e(n);
  return ride;
}

/** Cancel a matched ride inside a transaction. Reopens the other person's plan; late cancels cost kaju. */
export async function cancelRideInTx(tx: Tx, by: User, ride: Ride, now: Date, opts = { reopenOwn: true }): Promise<Effects> {
  if (ride.status !== "matched") return [];
  await tx.update(rides).set({ status: "cancelled", cancelledBy: by.id }).where(eq(rides.id, ride.id));
  const byPilot = by.id === ride.pilotId;
  // give the seat back / reopen the request, unless it's the canceller's own plan being withdrawn
  if (ride.offerId && (opts.reopenOwn || !byPilot)) {
    const [o] = await tx.select().from(plans).where(eq(plans.id, ride.offerId)).for("update");
    if (o && (o.status === "open" || o.status === "full")) await tx.update(plans).set({ seats: o.seats + 1, status: "open" }).where(eq(plans.id, o.id));
  }
  if (ride.requestId && (opts.reopenOwn || byPilot)) {
    const [r] = await tx.select().from(plans).where(eq(plans.id, ride.requestId)).for("update");
    if (r?.status === "full") await tx.update(plans).set({ status: byPilot ? "open" : "cancelled" }).where(eq(plans.id, r.id));
  }
  const late = isLateCancel(ride.departAt, now);
  if (byPilot && ride.viaFloat) await floaterCancelled(tx, by.id, ride, now);
  else if (late) await award(tx, by.id, KAJU.lateCancel, "late_cancel", `ride:${ride.id}`, now);
  const otherId = byPilot ? ride.hitcherId : ride.pilotId;
  const [other] = await tx.select().from(users).where(eq(users.id, otherId));
  const to = placeName(ride.toPlace);
  const text = late
    ? pick(LINES.lateCancel, { name: esc(by.name) })
    : `${esc(by.name)} can't make the ${istHHMM(ride.departAt)} ride to <b>${to}</b> after all. ${byPilot ? "Your request is open again, so someone else can grab it." : "Your seat is free again."}`;
  return [(n) => n.dm({ to: other.telegramId, text })];
}

/** A floater dropped a pickup: −10, and no float kaju for that hour. */
async function floaterCancelled(tx: Tx, userId: number, ride: Ride, now: Date) {
  await award(tx, userId, KAJU.floaterCancel, "floater_cancel", `ride:${ride.id}`, now);
  const [active] = await tx.select().from(floats).where(and(eq(floats.userId, userId), isNull(floats.endedAt))).for("update");
  if (active) {
    await tx.update(floats).set({ forfeitMinutes: active.forfeitMinutes + KAJU.floaterCancelForfeitMin }).where(eq(floats.id, active.id));
    return;
  }
  // the float already ended and was paid: take back up to an hour of it
  const [last] = await tx.select().from(floats).where(and(eq(floats.userId, userId), gte(floats.endedAt, ride.createdAt))).orderBy(desc(floats.endedAt)).limit(1);
  if (!last) return;
  const [paid] = await tx.select({ s: sql<number>`coalesce(sum(${kaju.amount}), 0)::int` }).from(kaju).where(and(eq(kaju.userId, userId), eq(kaju.ref, `float:${last.id}`)));
  const back = Math.min(paid?.s ?? 0, (KAJU.floaterCancelForfeitMin / 15) * KAJU.floatPer15);
  if (back > 0) await award(tx, userId, -back, "float_forfeit", `ride:${ride.id}`, now);
}

export async function cancelRide(db: Db, n: Notifier, user: User, rideId: number, now: Date) {
  const effects = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(rides).where(eq(rides.id, rideId)).for("update");
    if (!r || (r.pilotId !== user.id && r.hitcherId !== user.id)) throw new GameError("That isn't your ride.");
    if (r.status !== "matched") throw new GameError("That ride is already closed.");
    return cancelRideInTx(tx, user, r, now);
  });
  for (const e of effects) await e(n);
  const [r] = await db.select().from(rides).where(eq(rides.id, rideId));
  return { late: isLateCancel(r.departAt, now), floater: r.viaFloat && r.pilotId === user.id };
}

/** Either rider says whether it happened. One "yes" completes it and pays both. */
export async function confirmRide(db: Db, n: Notifier, user: User, rideId: number, happened: boolean, now: Date) {
  const res = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(rides).where(eq(rides.id, rideId)).for("update");
    if (!r || (r.pilotId !== user.id && r.hitcherId !== user.id)) throw new GameError("That isn't your ride.");
    if (r.status !== "matched") return { already: r.status };
    if (!happened) {
      await tx.update(rides).set({ status: "cancelled", cancelledBy: user.id }).where(eq(rides.id, r.id));
      return { already: null, done: false as const };
    }
    await tx.update(rides).set({ status: "done", completedAt: now }).where(eq(rides.id, r.id));
    if (r.requestId) await tx.update(plans).set({ status: "done" }).where(eq(plans.id, r.requestId));
    const pk = await award(tx, r.pilotId, KAJU.ridePilot, "ride_pilot", `ride:${r.id}`, now);
    const hk = await award(tx, r.hitcherId, KAJU.rideHitcher, "ride_hitcher", `ride:${r.id}`, now);
    const [p, h] = await loadUsers(tx, r.pilotId, r.hitcherId);
    return { already: null, done: true as const, p, h, pk, hk };
  });
  if (res.done) await n.announce(pick(LINES.rideDone, { pilot: esc(res.p.name), hitcher: esc(res.h.name), pilotKaju: res.pk, hitcherKaju: res.hk }));
  return res;
}

export async function myRides(db: Db, userId: number) {
  return db
    .select()
    .from(rides)
    .where(and(or(eq(rides.pilotId, userId), eq(rides.hitcherId, userId)), eq(rides.status, "matched")))
    .orderBy(rides.departAt);
}
