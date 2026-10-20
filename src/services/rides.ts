import { and, eq, gt, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { floatPings, floats, plans, rides, users, type Plan, type Ride, type User } from "@/db/schema";
import { esc, gifUrl, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { isLateCancel, KAJU, vehicleEmoji } from "@/lib/kaju";
import { MATCH_WINDOW_MIN, offerFitsRequest } from "@/lib/match";
import { destName, OPEN, placeName, tripLabel } from "@/lib/places";
import { inviteFirstRide } from "./invites";
import { celebrateMilestone } from "./stats";
import { istDayStart, istHHMM } from "@/lib/time";
import { award } from "./kaju";
import { GameError } from "./errors";

/** Messages to send after the transaction commits. */
export type Effects = ((n: Notifier) => Promise<void>)[];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const who = (u: User) =>
  u.username ? `<a href="https://t.me/${u.username}">${esc(u.name)}</a>` : `<a href="tg://user?id=${u.telegramId}">${esc(u.name)}</a>`;

/** Where a ride goes: the hitcher's own request if they posted one (they decide where they're dropped, even if they
 *  left it open), otherwise the pilot's offer. */
function rideEnds(offer: Plan | null | undefined, req: Plan | null | undefined) {
  const p = req ?? offer!;
  return { fromPlace: p.fromPlace, toPlace: p.toPlace, rangeKm: p.toPlace === OPEN.id ? p.rangeKm : null };
}

function matchedEffects(ride: Ride, pilot: User, hitcher: User): Effects {
  const to = esc(destName(ride.toPlace, null, ride.rangeKm));
  const from = esc(placeName(ride.fromPlace));
  const trip = tripLabel(ride.fromPlace, ride.toPlace, ride.rangeKm);
  const howFar = trip ? `\n🧭 ${trip}.${ride.toPlace === OPEN.id ? " Sort out exactly where when you meet." : ""}` : "";
  const time = istHHMM(ride.departAt);
  const cancel = [[{ text: "Can't make it", data: `cxr:${ride.id}` }]];
  return [
    (n) => n.dm({ to: pilot.telegramId, text: `${vehicleEmoji(pilot.vehicle)} You're taking ${who(hitcher)} from <b>${from}</b> to <b>${to}</b> around <b>${time}</b>. Say hi and sort the pickup spot.${pilot.vehicle === "car" ? "" : " Spare helmet?"}${howFar}`, buttons: cancel, animation: gifUrl("matched") }),
    (n) => n.dm({ to: hitcher.telegramId, text: `💞 ${who(pilot)} ${pilot.vehicle === "car" ? "(by car 🚗) " : ""}is taking you from <b>${from}</b> to <b>${to}</b> around <b>${time}</b>. Message them to sort the pickup spot.${howFar}`, buttons: cancel, animation: gifUrl("matched") }),
    (n) => n.announce(pick(LINES.match, { pilot: esc(pilot.name), hitcher: esc(hitcher.name), to, time })),
  ];
}

const W = MATCH_WINDOW_MIN * 60_000;
const around = (t: Date) => and(eq(rides.status, "matched"), gt(rides.departAt, new Date(t.getTime() - W)), lt(rides.departAt, new Date(t.getTime() + W)));

/** Nobody is in two places at once: one ride at a time for hitchers and two-wheelers, seats for cars. */
async function assertFree(tx: Tx, u: User, at: Date, role: "pilot" | "hitcher", exceptOfferId?: number | null) {
  const mine = await tx.select().from(rides).where(and(around(at), or(eq(rides.pilotId, u.id), eq(rides.hitcherId, u.id))));
  const asHitcher = mine.filter((r) => r.hitcherId === u.id);
  const asPilot = mine.filter((r) => r.pilotId === u.id && (exceptOfferId == null || r.offerId !== exceptOfferId));
  if (role === "hitcher") {
    if (mine.length) throw new GameError(`You already have a ride around ${istHHMM(at)}. Cancel it first if plans changed.`);
    return;
  }
  if (asHitcher.length) throw new GameError(`You're riding with someone else around ${istHHMM(at)}.`);
  if (u.vehicle === "car" ? asPilot.length >= Math.max(1, u.seats) : asPilot.length > 0)
    throw new GameError(u.vehicle === "car" ? `Your car's full around ${istHHMM(at)}.` : `Your back seat's taken around ${istHHMM(at)}. One pillion at a time!`);
}

/** After a match: the hitcher's other requests around then close, and a two-wheeler's other offers fill up. */
async function closeOverlaps(tx: Tx, ride: Ride, pilot: User) {
  const t = ride.departAt;
  const win = and(eq(plans.status, "open"), gt(plans.departAt, new Date(t.getTime() - W)), lt(plans.departAt, new Date(t.getTime() + W)));
  await tx.update(plans).set({ status: "cancelled" }).where(and(win, eq(plans.userId, ride.hitcherId), eq(plans.kind, "request"), ride.requestId ? ne(plans.id, ride.requestId) : undefined));
  if (pilot.vehicle !== "car") {
    await tx.update(plans).set({ status: "full" }).where(and(win, eq(plans.userId, pilot.id), eq(plans.kind, "offer"), ride.offerId ? ne(plans.id, ride.offerId) : undefined));
    await tx.update(plans).set({ status: "cancelled" }).where(and(win, eq(plans.userId, pilot.id), eq(plans.kind, "request")));
  }
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
    if (pilot.vehicle === "none") throw new GameError("You'll need wheels for that one. Set them with /wheels.");
    const [hitcherUser] = await tx.select().from(users).where(eq(users.id, req.userId));
    // attach the pilot's own matching offer, if they posted one
    const mine = await tx.select().from(plans).where(and(eq(plans.userId, pilot.id), eq(plans.kind, "offer"), eq(plans.status, "open")));
    const offer = mine.find((o) => offerFitsRequest(o, req));
    await assertFree(tx, pilot, req.departAt, "pilot", offer?.id);
    await assertFree(tx, hitcherUser, req.departAt, "hitcher");
    const [float] = await tx.select().from(floats).where(and(eq(floats.userId, pilot.id), isNull(floats.endedAt), gt(floats.liveUntil, now)));
    const [ride] = await tx
      .insert(rides)
      .values({ offerId: offer?.id ?? null, requestId: req.id, pilotId: pilot.id, hitcherId: req.userId, ...rideEnds(offer, req), departAt: req.departAt, viaFloat: Boolean(float), createdAt: now })
      .returning();
    await tx.update(plans).set({ status: "full" }).where(eq(plans.id, req.id));
    if (offer) await tx.update(plans).set({ seats: offer.seats - 1, status: offer.seats - 1 > 0 ? "open" : "full" }).where(eq(plans.id, offer.id));
    await tx.update(floatPings).set({ outcome: "took", resolvedAt: now }).where(and(eq(floatPings.userId, pilot.id), eq(floatPings.requestId, req.id), eq(floatPings.outcome, "pending")));
    await closeOverlaps(tx, ride, pilot);
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
    const [pilotUser] = await tx.select().from(users).where(eq(users.id, offer.userId));
    await assertFree(tx, hitcher, offer.departAt, "hitcher");
    await assertFree(tx, pilotUser, offer.departAt, "pilot", offer.id);
    const mine = await tx.select().from(plans).where(and(eq(plans.userId, hitcher.id), eq(plans.kind, "request"), eq(plans.status, "open")));
    const req = mine.find((r) => offerFitsRequest(offer, r));
    const [ride] = await tx
      .insert(rides)
      .values({ offerId: offer.id, requestId: req?.id ?? null, pilotId: offer.userId, hitcherId: hitcher.id, ...rideEnds(offer, req), departAt: offer.departAt, createdAt: now })
      .returning();
    await tx.update(plans).set({ seats: offer.seats - 1, status: offer.seats - 1 > 0 ? "open" : "full" }).where(eq(plans.id, offer.id));
    if (req) await tx.update(plans).set({ status: "full" }).where(eq(plans.id, req.id));
    await closeOverlaps(tx, ride, pilotUser);
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
  if (late) await award(tx, by.id, KAJU.lateCancel, "late_cancel", `ride:${ride.id}`, now);
  const otherId = byPilot ? ride.hitcherId : ride.pilotId;
  const [other] = await tx.select().from(users).where(eq(users.id, otherId));
  const to = destName(ride.toPlace, null, ride.rangeKm);
  const text = late
    ? pick(LINES.lateCancel, { name: esc(by.name) })
    : `${esc(by.name)} can't make the ${istHHMM(ride.departAt)} ride to <b>${to}</b> after all. ${byPilot ? "Your request is open again, so someone else can grab it." : "Your seat is free again."}`;
  return [(n) => n.dm({ to: other.telegramId, text })];
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
  return { late: isLateCancel(r.departAt, now) };
}

/** Either rider says whether it happened. One "yes" completes it and pays both; a "no" waits for the other's word. */
export async function confirmRide(db: Db, n: Notifier, user: User, rideId: number, happened: boolean, now: Date) {
  const res = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(rides).where(eq(rides.id, rideId)).for("update");
    if (!r || (r.pilotId !== user.id && r.hitcherId !== user.id)) throw new GameError("That isn't your ride.");
    if (r.status !== "matched") return { already: r.status };
    if (!happened) {
      if (r.deniedBy && r.deniedBy !== user.id) {
        // both say it didn't happen: close it, no kaju, no blame
        await tx.update(rides).set({ status: "cancelled" }).where(eq(rides.id, r.id));
      } else await tx.update(rides).set({ deniedBy: user.id }).where(eq(rides.id, r.id));
      return { already: null, done: false as const };
    }
    if (r.departAt.getTime() > now.getTime() + 5 * 60_000) throw new GameError(`That ride is at ${istHHMM(r.departAt)}: confirm it once you've ridden!`);
    await tx.update(rides).set({ status: "done", completedAt: now }).where(eq(rides.id, r.id));
    if (r.requestId) await tx.update(plans).set({ status: "done" }).where(eq(plans.id, r.requestId));
    // the same two people are paid for at most N rides a day
    const dayStart = istDayStart(r.departAt);
    const [pair] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(rides)
      .where(and(eq(rides.status, "done"), ne(rides.id, r.id), gte(rides.departAt, dayStart), lt(rides.departAt, new Date(dayStart.getTime() + 24 * 3600_000)),
        or(and(eq(rides.pilotId, r.pilotId), eq(rides.hitcherId, r.hitcherId)), and(eq(rides.pilotId, r.hitcherId), eq(rides.hitcherId, r.pilotId)))));
    const capped = (pair?.n ?? 0) >= KAJU.pairRidesPerDay;
    const pk = capped ? 0 : await award(tx, r.pilotId, KAJU.ridePilot, "ride_pilot", `ride:${r.id}`, now);
    const hk = capped ? 0 : await award(tx, r.hitcherId, KAJU.rideHitcher, "ride_hitcher", `ride:${r.id}`, now);
    const [p, h] = await loadUsers(tx, r.pilotId, r.hitcherId);
    return { already: null, done: true as const, p, h, pk, hk, capped };
  });
  if (res.done) await inviteFirstRide(db, n, [res.p, res.h], now);
  if (res.done && !res.capped) {
    // the kaju moment, for both of them
    await n.dm({ to: res.p.telegramId, text: `🥜 Ride done with ${esc(res.h.name)}! +${res.pk} kaju for bringing the wheels.`, animation: gifUrl("kaju") });
    await n.dm({ to: res.h.telegramId, text: `🥜 Ride done with ${esc(res.p.name)}! +${res.hk} kaju for the company.`, animation: gifUrl("kaju") });
    await n.announce(pick(LINES.rideDone, { pilot: esc(res.p.name), hitcher: esc(res.h.name), pilotKaju: res.pk, hitcherKaju: res.hk }));
  }
  if (res.done) await celebrateMilestone(db, n, res.p.name, res.h.name);
  return res;
}

/** Ticker: rides nobody confirmed within a day just expire (no kaju, no blame). */
export async function expireRides(db: Db, now: Date) {
  await db.update(rides).set({ status: "expired" }).where(and(eq(rides.status, "matched"), lt(rides.departAt, new Date(now.getTime() - 24 * 3600_000))));
}

export async function myRides(db: Db, userId: number) {
  return db
    .select()
    .from(rides)
    .where(and(or(eq(rides.pilotId, userId), eq(rides.hitcherId, userId)), eq(rides.status, "matched")))
    .orderBy(rides.departAt);
}
