import { describe, expect, it } from "vitest";
import { handleUpdate, type Ctx, type Update } from "@/bot/handle";
import { allPlaces, tripLabel } from "@/lib/places";
import { createPlan, GameError } from "@/services/plans";
import { loadPlaces } from "@/services/places";
import { hopOn, takeRequest } from "@/services/rides";
import { at, notifier, person, T0, testDb } from "./helpers";

describe("open destinations and distances", () => {
  it("estimates road km and minutes for pinned places", () => {
    expect(tripLabel("riva", "arambol")).toBe("≈2.5 km · ~6 min");
    expect(tripLabel("riva", "open", 5)).toBe("up to ~5 km · ~12 min");
    expect(tripLabel("riva", "errand")).toBeNull();
  });

  it("an open request reaches pilots starting nearby, with how far; the ride stays open with its range", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Pia", "scooty");
    const far = await person(db, "Far", "scooty");
    const hitcher = await person(db, "Hal");
    await createPlan(db, n, pilot, { kind: "offer", fromPlace: "nanu", toPlace: "arambol", departAt: at(60) }, T0); // Nanu is ~1 km from Riva
    await createPlan(db, n, far, { kind: "offer", fromPlace: "mapusa", toPlace: "arambol", departAt: at(60) }, T0);
    await expect(createPlan(db, n, hitcher, { kind: "request", fromPlace: "riva", toPlace: "open", departAt: at(60) }, T0)).rejects.toThrow(GameError);
    const r = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "riva", toPlace: "open", rangeKm: 5, note: "towards Morjim", departAt: at(60) }, T0);
    expect(r.pinged).toBe(1);
    const ping = n.dms.find((m) => m.to === pilot.telegramId)!;
    expect(ping.text).toContain("somewhere ~5 km away (towards Morjim)");
    expect(ping.text).toContain("up to ~5 km · ~12 min from the pickup");
    const ride = await takeRequest(db, n, pilot, r.plan.id, at(5));
    expect(ride).toMatchObject({ fromPlace: "riva", toPlace: "open", rangeKm: 5 });
    expect(n.dms.some((m) => m.to === hitcher.telegramId && m.text.includes("Sort out exactly where"))).toBe(true);
  });

  it("an open offer ('up to N km') fits requests whose trip fits, and the ride takes the hitcher's destination", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Pia", "scooty");
    const near = await person(db, "Near");
    const far = await person(db, "Far");
    const offer = await createPlan(db, n, pilot, { kind: "offer", fromPlace: "riva", toPlace: "open", rangeKm: 5, departAt: at(120) }, T0);
    await createPlan(db, n, near, { kind: "request", fromPlace: "riva", toPlace: "arambol", departAt: at(120) }, at(1)); // ~2.5 km: fits
    await createPlan(db, n, far, { kind: "request", fromPlace: "riva", toPlace: "mapusa", departAt: at(120) }, at(1)); // ~15 km: doesn't
    expect(n.dms.filter((m) => m.to === pilot.telegramId).length).toBe(1);
    const ride = await hopOn(db, n, near, offer.plan.id, at(2));
    expect(ride).toMatchObject({ toPlace: "arambol", rangeKm: null });
  });

  it("pickers rank places by what the village actually chooses (after hubs and events)", async () => {
    const db = await testDb();
    const n = notifier();
    const u = await person(db, "U");
    for (let i = 0; i < 3; i++) await createPlan(db, n, u, { kind: "request", fromPlace: "riva", toPlace: "siolim", departAt: at(60 + i * 100) }, T0);
    await loadPlaces(db, true);
    expect(allPlaces().slice(0, 4).map((p) => p.id)).toEqual(["riva", "circle", "community-dinner", "siolim"]);
  });

  it("the bot: 🧭 Open → how far → from → when", async () => {
    const db = await testDb();
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const call = (async (method: string, params: Record<string, unknown>) => { calls.push({ method, params }); return method === "getChatMember" ? { status: "member" } : {}; }) as Ctx["call"];
    const ctx: Ctx = { db, call, n: notifier(), now: T0 };
    const msg = (text: string): Update => ({ message: { chat: { id: 7, type: "private" }, from: { id: 7, first_name: "S" }, text } });
    const tap = (data: string): Update => ({ callback_query: { id: "q", from: { id: 7, first_name: "S" }, data, message: { chat: { id: 7 }, message_id: 1 } } });
    await handleUpdate(ctx, msg("/start"));
    await handleUpdate(ctx, tap("veh:scooty"));
    await handleUpdate(ctx, msg("/go"));
    await handleUpdate(ctx, tap("w:to:open"));
    await handleUpdate(ctx, tap("w:r:10"));
    await handleUpdate(ctx, tap("w:from:circle"));
    await handleUpdate(ctx, tap("w:t:120"));
    const last = String(calls.filter((c) => c.method === "sendMessage").at(-1)!.params.text);
    expect(last).toContain("up to ~10 km");
    expect(last).toContain("🧭 up to ~10 km · ~24 min");
  });
});
