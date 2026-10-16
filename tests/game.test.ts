import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { plans, rides } from "@/db/schema";
import { balance } from "@/services/kaju";
import { cancelPlan, createPlan } from "@/services/plans";
import { cancelRide, confirmRide, hopOn, takeRequest } from "@/services/rides";
import { locate, stopFloat } from "@/services/floats";
import { tick } from "@/services/ticker";
import { computeWinners } from "@/services/prizes";
import { finishOnboarding } from "@/services/users";
import { at, notifier, person, T0, testDb } from "./helpers";

describe("a day in Pillion", () => {
  it("signup pays once", async () => {
    const db = await testDb();
    const a = await person(db, "Asha");
    expect(await finishOnboarding(db, a.id, T0)).toBe(10);
    expect(await finishOnboarding(db, a.id, T0)).toBe(0);
    expect(await balance(db, a.id)).toBe(10);
  });

  it("early plan pays more, pings a matching pilot, and a take creates one ride", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Arjun", "scooty");
    const hitcher = await person(db, "Meera");
    const offer = await createPlan(db, n, pilot, { kind: "offer", fromPlace: "riva", toPlace: "arambol", departAt: at(360), seats: 1 }, T0);
    expect(offer.kaju).toBe(15);
    expect(n.announcements).toHaveLength(1); // early bird
    const req = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "circle", toPlace: "arambol", departAt: at(380) }, T0);
    expect(n.dms.some((m) => m.to === pilot.telegramId && m.buttons?.[0][0].data === `take:${req.plan.id}`)).toBe(true);

    const ride = await takeRequest(db, n, pilot, req.plan.id, at(1));
    expect(ride.offerId).toBe(offer.plan.id);
    const [o] = await db.select().from(plans).where(eq(plans.id, offer.plan.id));
    expect(o.seats).toBe(0);
    expect(o.status).toBe("full");
    await expect(takeRequest(db, n, pilot, req.plan.id, at(2))).rejects.toThrow(/beat you/);
  });

  it("hop on, confirm pays both once", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Rohan", "scooty");
    const hitcher = await person(db, "Sana");
    const offer = await createPlan(db, n, pilot, { kind: "offer", fromPlace: "riva", toPlace: "morjim", departAt: at(10), seats: 2 }, T0);
    expect(offer.kaju).toBe(5);
    const ride = await hopOn(db, n, hitcher, offer.plan.id, at(1));
    await expect(hopOn(db, n, hitcher, offer.plan.id, at(2))).rejects.toThrow(/already/);
    await confirmRide(db, n, hitcher, ride.id, true, at(60));
    await confirmRide(db, n, pilot, ride.id, true, at(61));
    expect(await balance(db, pilot.id)).toBe(5 + 30);
    expect(await balance(db, hitcher.id)).toBe(10);
  });

  it("late cancel costs 5 and reopens the request; early cancel is free", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Dev", "scooty");
    const hitcher = await person(db, "Tanvi");
    const req = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "circle", toPlace: "ashwem", departAt: at(120) }, T0);
    const ride = await takeRequest(db, n, pilot, req.plan.id, at(5));
    await cancelRide(db, n, pilot, ride.id, at(100)); // 20 min before
    expect(await balance(db, pilot.id)).toBe(-5);
    const [r] = await db.select().from(plans).where(eq(plans.id, req.plan.id));
    expect(r.status).toBe("open");
    expect(n.dms.at(-1)!.to).toBe(hitcher.telegramId);

    const ride2 = await takeRequest(db, n, pilot, req.plan.id, at(101));
    await cancelPlan(db, n, hitcher, req.plan.id, at(20)); // hitcher withdraws early
    const [r2] = await db.select().from(rides).where(eq(rides.id, ride2.id));
    expect(r2.status).toBe("cancelled");
  });

  it("floaters get pinged, and floating pays by the quarter hour", async () => {
    const db = await testDb();
    const n = notifier();
    const floater = await person(db, "Kabir", "scooty");
    const hitcher = await person(db, "Priya");
    const started = await locate(db, n, floater, { lat: 15.6509, lng: 73.7165, livePeriod: 3600 * 4 }, T0);
    expect(started).toMatchObject({ started: true, near: "the Circle" });
    const req = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "circle", toPlace: "mapusa", departAt: at(5) }, at(1));
    expect(n.dms.some((m) => m.to === floater.telegramId && m.buttons?.[0][0].data === `take:${req.plan.id}`)).toBe(true);
    const ride = await takeRequest(db, n, floater, req.plan.id, at(2));
    expect(ride.viaFloat).toBe(true);
    const res = await stopFloat(db, n, floater, at(95));
    expect(res).toMatchObject({ minutes: 95, got: 30 });
  });

  it("ticker asks once, and prizes find winners", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Lia", "scooty");
    const hitcher = await person(db, "Omar");
    const req = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "riva", toPlace: "market", departAt: at(150) }, T0);
    const ride = await takeRequest(db, n, pilot, req.plan.id, at(1));
    await tick(db, n, at(175));
    await tick(db, n, at(176));
    expect(n.dms.filter((m) => m.buttons?.[0][0].data === `done:${ride.id}:y`)).toHaveLength(2);
    await confirmRide(db, n, pilot, ride.id, true, at(180));
    const winners = await computeWinners(db, "2026-10-17");
    const by = Object.fromEntries(winners.map((w) => [w.prize, w.userIds]));
    expect(by.generous).toEqual([pilot.id]);
    expect(by.early).toEqual([hitcher.id]);
    expect(by.hero).toEqual([pilot.id]);
    expect(by.mystery).toHaveLength(1);
  });
});
