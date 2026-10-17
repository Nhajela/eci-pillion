import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { floats, plans, rides } from "@/db/schema";
import { balance } from "@/services/kaju";
import { cancelPlan, createPlan } from "@/services/plans";
import { confirmRide, hopOn, takeRequest } from "@/services/rides";
import { locate, refuseRequest, stillHere, stopFloat } from "@/services/floats";
import { tick } from "@/services/ticker";
import { updateUser } from "@/services/users";
import { floatableMinutes } from "@/lib/time";
import { at, notifier, person, T0, testDb } from "./helpers";

const CIRCLE = { lat: 15.6509, lng: 73.7165 };

describe("floaters say yes", () => {
  it("refusing a request: −10, the last hour unpaid, float over", async () => {
    const db = await testDb();
    const n = notifier();
    const f = await person(db, "Kabir", "scooty");
    const h = await person(db, "Priya");
    await locate(db, n, f, { ...CIRCLE, livePeriod: 4 * 3600 }, T0);
    const req = await createPlan(db, n, h, { kind: "request", fromPlace: "circle", toPlace: "morjim", departAt: at(100) }, at(90));
    const ping = n.dms.find((m) => m.to === f.telegramId && m.buttons?.[0][1]?.data === `nope:${req.plan.id}`);
    expect(ping).toBeTruthy();
    const r = await refuseRequest(db, n, f, req.plan.id, at(95));
    expect(r).toEqual({ lost: -10, paid: 10 }); // 95 min, 60 forfeited → 35 → 2 quarters → 10
    expect(await balance(db, f.id)).toBe(0);
    const [fl] = await db.select().from(floats).where(eq(floats.userId, f.id));
    expect(fl.endedAt).not.toBeNull();
    await expect(refuseRequest(db, n, f, req.plan.id, at(96))).rejects.toThrow(/already sorted/);
  });

  it("ignoring a ping for 10 minutes while nobody takes it counts as refusing", async () => {
    const db = await testDb();
    const n = notifier();
    const f = await person(db, "Lia", "scooty");
    const h = await person(db, "Omar");
    await locate(db, n, f, { ...CIRCLE, livePeriod: 4 * 3600 }, T0);
    await createPlan(db, n, h, { kind: "request", fromPlace: "circle", toPlace: "ashwem", departAt: at(40) }, at(30));
    await tick(db, n, at(35));
    expect(await balance(db, f.id)).toBe(0);
    await tick(db, n, at(41));
    expect(await balance(db, f.id)).toBe(-10); // 41 min − 60 forfeited → nothing paid
    expect(n.dms.at(-1)!.text).toContain("weren't really free");
  });

  it("no penalty when someone else took it, or when you stopped floating first", async () => {
    const db = await testDb();
    const n = notifier();
    const f1 = await person(db, "Sam", "scooty");
    const f2 = await person(db, "Ira", "scooty");
    const f3 = await person(db, "Zed", "scooty");
    const h = await person(db, "Tara");
    for (const f of [f1, f2, f3]) await locate(db, n, f, { ...CIRCLE, livePeriod: 4 * 3600 }, T0);
    const req = await createPlan(db, n, h, { kind: "request", fromPlace: "circle", toPlace: "siolim", departAt: at(70) }, at(60));
    await stopFloat(db, n, f3, at(62)); // honest: busy now
    await takeRequest(db, n, f1, req.plan.id, at(63));
    await tick(db, n, at(75));
    expect(await balance(db, f2.id)).toBe(0);
    expect(await balance(db, f3.id)).toBe(20); // 62 min → 4 quarters
    const active = await db.select().from(floats).where(eq(floats.userId, f2.id));
    expect(active[0].endedAt).toBeNull();
  });

  it("busy floaters and night-time floaters aren't pinged", async () => {
    const db = await testDb();
    const n = notifier();
    const f = await person(db, "Nia", "scooty");
    const h1 = await person(db, "Oz");
    const h2 = await person(db, "Pia");
    await locate(db, n, f, { ...CIRCLE, livePeriod: 4 * 3600 }, T0);
    const r1 = await createPlan(db, n, h1, { kind: "request", fromPlace: "circle", toPlace: "ashwem", departAt: at(30) }, at(5));
    await takeRequest(db, n, f, r1.plan.id, at(6));
    const before = n.dms.length;
    await createPlan(db, n, h2, { kind: "request", fromPlace: "circle", toPlace: "morjim", departAt: at(35) }, at(10));
    expect(n.dms.slice(before).some((m) => m.to === f.telegramId)).toBe(false);
    await tick(db, n, at(25));
    expect(await balance(db, f.id)).toBe(0); // no refusal for a ping never sent
  });

  it("quiet floats get asked, and end at the question if nobody answers", async () => {
    const db = await testDb();
    const n = notifier();
    const f = await person(db, "Rui", "scooty");
    await locate(db, n, f, { ...CIRCLE, livePeriod: 8 * 3600 }, T0);
    await tick(db, n, at(31));
    expect(n.dms.at(-1)!.buttons?.[0][0].data).toBe("still");
    expect(await stillHere(db, f, at(35))).toBe(true);
    await tick(db, n, at(66)); // quiet again since 35
    await tick(db, n, at(82)); // 16 min, no answer
    const [fl] = await db.select().from(floats).where(eq(floats.userId, f.id));
    expect(fl.endedAt!.getTime()).toBe(at(66).getTime());
    expect(await balance(db, f.id)).toBe(20); // 66 min → 4 quarters
  });

  it("only wheels, only the village, only waking hours", async () => {
    const db = await testDb();
    const n = notifier();
    const walker = await person(db, "Wes");
    expect(await locate(db, n, walker, { ...CIRCLE, livePeriod: 3600 }, T0)).toMatchObject({ noWheels: true });
    const f = await person(db, "Vic", "scooty");
    expect(await locate(db, n, f, { lat: 15.4909, lng: 73.8278, livePeriod: 3600 }, T0)).toMatchObject({ outside: true });
    // 22:30 → 00:30 IST: only 30 minutes are floating hours
    expect(floatableMinutes(new Date("2026-10-17T17:00:00Z"), new Date("2026-10-17T19:00:00Z"))).toBe(30);
  });
});

describe("nobody is in two places at once", () => {
  it("a scooty takes one pillion at a time; a car up to its seats", async () => {
    const db = await testDb();
    const n = notifier();
    const scooty = await person(db, "Asha", "scooty");
    const car = await updateUser(db, (await person(db, "Anil")).id, { vehicle: "car", seats: 2 });
    const reqs = [];
    for (const name of ["H1", "H2", "H3", "H4"]) {
      const h = await person(db, name);
      reqs.push((await createPlan(db, n, h, { kind: "request", fromPlace: "riva", toPlace: "arambol", departAt: at(240) }, T0)).plan.id);
    }
    await takeRequest(db, n, scooty, reqs[0], at(1));
    await expect(takeRequest(db, n, scooty, reqs[1], at(2))).rejects.toThrow(/One pillion at a time/);
    await takeRequest(db, n, car, reqs[1], at(3));
    await takeRequest(db, n, car, reqs[2], at(4));
    await expect(takeRequest(db, n, car, reqs[3], at(5))).rejects.toThrow(/car's full/);
  });

  it("a hitcher can't double-book, and their other requests close on a match", async () => {
    const db = await testDb();
    const n = notifier();
    const p1 = await person(db, "P1", "scooty");
    const p2 = await person(db, "P2", "scooty");
    const h = await person(db, "Hal");
    const o1 = await createPlan(db, n, p1, { kind: "offer", fromPlace: "riva", toPlace: "morjim", departAt: at(200) }, T0);
    const o2 = await createPlan(db, n, p2, { kind: "offer", fromPlace: "riva", toPlace: "siolim", departAt: at(210) }, T0);
    const other = await createPlan(db, n, h, { kind: "request", fromPlace: "riva", toPlace: "mapusa", departAt: at(205) }, T0);
    await hopOn(db, n, h, o1.plan.id, at(1));
    await expect(hopOn(db, n, h, o2.plan.id, at(2))).rejects.toThrow(/already have a ride/);
    const [r] = await db.select().from(plans).where(eq(plans.id, other.plan.id));
    expect(r.status).toBe("cancelled");
  });
});

describe("no farming", () => {
  it("cancelling a plan nobody rode on gives its kaju back", async () => {
    const db = await testDb();
    const n = notifier();
    const p = await person(db, "Fay", "scooty");
    const a = await createPlan(db, n, p, { kind: "offer", fromPlace: "riva", toPlace: "morjim", departAt: at(300) }, T0);
    expect(await balance(db, p.id)).toBe(15);
    await cancelPlan(db, n, p, a.plan.id, at(1));
    expect(await balance(db, p.id)).toBe(0);
  });

  it("the same two people are paid for two rides a day at most", async () => {
    const db = await testDb();
    const n = notifier();
    const p = await person(db, "Gus", "scooty");
    const h = await person(db, "Hana");
    for (const t of [30, 120, 240]) {
      const o = await createPlan(db, n, p, { kind: "offer", fromPlace: "riva", toPlace: "circle", departAt: at(t) }, at(t - 20));
      const ride = await hopOn(db, n, h, o.plan.id, at(t - 10));
      await confirmRide(db, n, h, ride.id, true, at(t + 30));
    }
    const plansKaju = 5 + 5 + 5; // three plans posted 20 min ahead
    expect(await balance(db, p.id)).toBe(plansKaju + 2 * 30);
    expect(await balance(db, h.id)).toBe(2 * 10);
  });
});

describe("confirming rides", () => {
  it("one 'no' doesn't block the other's 'yes'; two 'no's close it; early 'yes' waits", async () => {
    const db = await testDb();
    const n = notifier();
    const p = await person(db, "Ivo", "scooty");
    const h = await person(db, "Jo");
    const o = await createPlan(db, n, p, { kind: "offer", fromPlace: "riva", toPlace: "circle", departAt: at(60) }, T0);
    const ride = await hopOn(db, n, h, o.plan.id, at(1));
    await expect(confirmRide(db, n, h, ride.id, true, at(2))).rejects.toThrow(/once you've ridden/);
    await confirmRide(db, n, h, ride.id, false, at(90));
    await confirmRide(db, n, p, ride.id, true, at(91));
    expect(await balance(db, h.id)).toBe(10);

    const o2 = await createPlan(db, n, p, { kind: "offer", fromPlace: "circle", toPlace: "riva", departAt: at(200) }, at(100));
    const ride2 = await hopOn(db, n, h, o2.plan.id, at(101));
    await confirmRide(db, n, h, ride2.id, false, at(230));
    await confirmRide(db, n, p, ride2.id, false, at(231));
    const [r2] = await db.select().from(rides).where(eq(rides.id, ride2.id));
    expect(r2.status).toBe("cancelled");
  });

  it("rides nobody confirms expire after a day", async () => {
    const db = await testDb();
    const n = notifier();
    const p = await person(db, "Kai", "scooty");
    const h = await person(db, "Lu");
    const o = await createPlan(db, n, p, { kind: "offer", fromPlace: "riva", toPlace: "circle", departAt: at(60) }, T0);
    const ride = await hopOn(db, n, h, o.plan.id, at(1));
    await tick(db, n, at(60 + 24 * 60 + 1));
    const [r] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(r.status).toBe("expired");
  });
});
