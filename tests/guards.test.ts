import { afterEach, describe, expect, it } from "vitest";
import { handleUpdate, type Ctx } from "@/bot/handle";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncEvents, upcomingEvents, venueToName } from "@/services/events";
import { balance } from "@/services/kaju";
import { createPlan, GameError } from "@/services/plans";
import { confirmRide, hopOn } from "@/services/rides";
import { departures } from "@/services/stats";
import { tick } from "@/services/ticker";
import { finishOnboarding, getByTelegram } from "@/services/users";
import { at, notifier, person, T0, testDb } from "./helpers";

afterEach(() => { delete process.env.EDGEOS_KEY; });

const old = async (db: Awaited<ReturnType<typeof testDb>>, name: string, vehicle: "scooty" | "none" = "none") => {
  const u = await person(db, name, vehicle);
  await db.update(users).set({ onboardedAt: new Date(T0.getTime() - 3 * 86400_000) }).where(eq(users.id, u.id));
  return (await getByTelegram(db, u.telegramId))!;
};

describe("guards against fake accounts", () => {
  it("a brand-new account's ride pays only when both say it happened", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await old(db, "Pia", "scooty");
    const fresh = await person(db, "Fresh", "none", { signedUp: false });
    await finishOnboarding(db, fresh.id, T0);
    const hitcher = (await getByTelegram(db, fresh.telegramId))!;
    const offer = await createPlan(db, n, pilot, { kind: "offer", fromPlace: "circle", toPlace: "riva", departAt: at(30) }, T0);
    const ride = await hopOn(db, n, hitcher, offer.plan.id, at(1));
    const before = await balance(db, pilot.id);
    expect(await confirmRide(db, n, hitcher, ride.id, true, at(60))).toMatchObject({ waiting: true });
    expect(await confirmRide(db, n, hitcher, ride.id, true, at(61))).toMatchObject({ waiting: true }); // saying it twice isn't both
    expect(await balance(db, pilot.id)).toBe(before);
    expect(await confirmRide(db, n, pilot, ride.id, true, at(62))).toMatchObject({ done: true });
    expect(await balance(db, pilot.id)).toBe(before + 30);
  });

  it("blocked accounts can't post or ride; other bots are ignored", async () => {
    const db = await testDb();
    const n = notifier();
    const u = await old(db, "Spam", "scooty");
    await db.update(users).set({ role: "blocked" }).where(eq(users.id, u.id));
    const blocked = (await getByTelegram(db, u.telegramId))!;
    await expect(createPlan(db, n, blocked, { kind: "offer", fromPlace: "circle", toPlace: "riva", departAt: at(30) }, T0)).rejects.toThrow(/paused/);
    const calls: string[] = [];
    const call = (async (m: string) => { calls.push(m); return {}; }) as Ctx["call"];
    await handleUpdate({ db, call, n, now: T0 }, { message: { chat: { id: 99, type: "private" }, from: { id: 99, is_bot: true, first_name: "Bot" }, text: "/start" } });
    expect(calls).toEqual([]);
    expect(await getByTelegram(db, 99)).toBeNull();
  });
});

describe("prizes are off", () => {
  it("9pm passes without a prize post or prize kaju", async () => {
    const db = await testDb();
    const n = notifier();
    await tick(db, n, new Date("2026-10-17T15:35:00Z")); // 21:05 IST
    expect(n.announcements.some((a) => /prize|winner/i.test(a))).toBe(false);
  });
});

describe("EdgeOS events", () => {
  it("syncs public events, maps venues to places, and lists what you can ride to", async () => {
    const db = await testDb();
    process.env.EDGEOS_KEY = "test";
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    const fake = (async (u: URL) => {
      if (u.pathname.endsWith("/popups/portal/list")) return json([{ id: "p1", slug: "edge-india", name: "Edge India" }]);
      if (u.pathname.endsWith("/event-venues/portal/venues")) return json({ results: [{ id: "v1", title: "Riva: Garden Oasis" }, { id: "v2", title: "The Circle.Work: Main Floor" }] });
      return json({ results: [
        { id: "e1", title: "Regen Goa Daily Circle", start_time: at(120).toISOString(), end_time: at(180).toISOString(), venue_id: "v1", custom_location_name: null, visibility: "public" },
        { id: "e2", title: "Grand Crypto", start_time: at(240).toISOString(), end_time: at(300).toISOString(), venue_id: null, custom_location_name: "Kicks Coffee", visibility: "public" },
        { id: "e3", title: "Secret", start_time: at(60).toISOString(), end_time: at(90).toISOString(), venue_id: "v2", custom_location_name: null, visibility: "private" },
        { id: "e4", title: "Online", start_time: at(60).toISOString(), end_time: at(90).toISOString(), venue_id: null, custom_location_name: "https://zoom.us/x", visibility: "public" },
      ] });
    }) as unknown as typeof fetch;
    expect(await syncEvents(db, T0, fake)).toBe(3);
    const evs = await upcomingEvents(db, T0);
    expect(evs.map((e) => [e.title, e.placeId])).toEqual([["Grand Crypto", "kicks-coffee"]]); // the Riva one: just pick Riva
    expect(venueToName("The Circle.Work: Garden")).toBe("the Circle");
  });

  it("the flight board lists departures with a status", async () => {
    const db = await testDb();
    const n = notifier();
    const h = await old(db, "Hal");
    await createPlan(db, n, h, { kind: "request", fromPlace: "riva", toPlace: "arambol", departAt: at(10) }, T0);
    const deps = await departures(db, T0);
    expect(deps[0]).toMatchObject({ from: "riva", to: "arambol", who: "Hal", status: "SEEKING SEAT" });
  });
});

describe("invite guards", () => {
  it("the first-ride bonus doesn't count a ride with the inviter; join kaju caps at 5 a day", async () => {
    const db = await testDb();
    const n = notifier();
    const { claimInvite } = await import("@/services/invites");
    const boss = await old(db, "Boss", "scooty");
    const alts = [];
    for (let i = 0; i < 6; i++) {
      const a = await person(db, `Alt${i}`);
      await db.update(users).set({ invitedBy: boss.id }).where(eq(users.id, a.id));
      await finishOnboarding(db, a.id, T0);
      alts.push((await getByTelegram(db, a.telegramId))!);
      await claimInvite(db, n, alts[i], T0);
    }
    const afterJoins = await balance(db, boss.id);
    expect(afterJoins).toBe(5 * 10);
    const offer = await createPlan(db, n, boss, { kind: "offer", fromPlace: "circle", toPlace: "riva", departAt: at(30) }, T0);
    const ride = await hopOn(db, n, alts[0], offer.plan.id, at(1));
    await confirmRide(db, n, alts[0], ride.id, true, at(60));
    await confirmRide(db, n, boss, ride.id, true, at(61));
    const { kaju } = await import("@/db/schema");
    const rows = await db.select().from(kaju).where(eq(kaju.userId, boss.id));
    expect(rows.some((r) => r.reason === "invite_ride")).toBe(false);
    expect(GameError).toBeTruthy();
  });
});

describe("venue names", () => {
  it("turn EdgeOS venue text into places people can ride to", () => {
    expect(venueToName("Riva Beach Resort: meet on the grass")).toBe("Riva");
    expect(venueToName("Cuebebar on the Beach")).toBe("the Circle");
    expect(venueToName("Aqua0 Residency 2nd floor right above kicks coffee")).toBe("Aqua0 Residency");
    expect(venueToName("Ashwe 351 (inside Palma Beach Resort)")).toBe("Ashwe 351");
    expect(venueToName("To be disclosed after Luma registration")).toBeNull();
    expect(venueToName("Remote (on bed welcomed!)")).toBeNull();
    expect(venueToName("Anima House")).toBe("Anima House");
  });
});

describe("place aliases", () => {
  it("Chique Shanti Villa merges into Community Builders Residency, and new events there land on the residency", async () => {
    const db = await testDb();
    const n = notifier();
    const { findOrAddPlace, applyAliases, findPlace } = await import("@/services/places");
    const villa = (await findOrAddPlace(db, null, "Chique Shanti Villa", null)).place;
    const cbr = (await findOrAddPlace(db, null, "Community Builders Residency", null)).place;
    const h = await old(db, "Hal");
    const p = await createPlan(db, n, h, { kind: "request", fromPlace: "riva", toPlace: villa.id, departAt: at(60) }, T0);
    expect(await applyAliases(db)).toBe(1);
    expect(await applyAliases(db)).toBe(0); // once
    const { plans } = await import("@/db/schema");
    expect((await db.select().from(plans).where(eq(plans.id, p.plan.id)))[0].toPlace).toBe(cbr.id);
    expect(findPlace("chique shanti villa")?.id).toBe(cbr.id);
  });
});
