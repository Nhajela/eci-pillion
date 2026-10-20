import { afterEach, describe, expect, it } from "vitest";
import { handleUpdate, type Ctx, type Update } from "@/bot/handle";
import { placeById, samePlace } from "@/lib/places";
import { locate } from "@/services/floats";
import { createPlan, GameError } from "@/services/plans";
import { findOrAddPlace, parsePin, savePlace } from "@/services/places";
import { fileReport, listReports, setReportStatus } from "@/services/reports";
import { setRole } from "@/services/roles";
import { getByTelegram } from "@/services/users";
import { at, notifier, person, T0, testDb } from "./helpers";

function fakeTelegram() {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const call = (async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    return method === "getChatMember" ? { status: "member" } : {};
  }) as Ctx["call"];
  const sent = () => calls.filter((c) => c.method === "sendMessage" || c.method === "sendAnimation");
  const texts = () => sent().map((c) => String(c.params.text ?? c.params.caption));
  const buttons = () => sent().flatMap((c) => ((c.params.reply_markup as { inline_keyboard?: { callback_data?: string }[][] })?.inline_keyboard ?? []).flat().map((b) => b.callback_data));
  return { call, calls, texts, buttons };
}
const msg = (id: number, text: string, username = `u${id}`): Update => ({ message: { chat: { id, type: "private" }, from: { id, first_name: `P${id}`, username }, text } });
const pin = (id: number, lat: number, lng: number): Update => ({ message: { chat: { id, type: "private" }, from: { id, first_name: `P${id}` }, location: { latitude: lat, longitude: lng } } });
const tap = (id: number, data: string): Update => ({ callback_query: { id: `q${Math.random()}`, from: { id, first_name: `P${id}` }, data, message: { chat: { id }, message_id: 1 } } });

afterEach(() => { delete process.env.BOOTSTRAP_ADMINS; });

describe("roles", () => {
  it("bootstrap admins by Telegram username; admins set roles, never demote themselves", async () => {
    process.env.BOOTSTRAP_ADMINS = "@Naman, someone";
    const db = await testDb();
    const naman = await person(db, "Naman");
    const asha = await person(db, "Asha");
    expect(naman.role).toBe("admin");
    expect(asha.role).toBe("member");
    await expect(setRole(db, asha, naman.id, "member")).rejects.toThrow(GameError);
    await expect(setRole(db, naman, naman.id, "staff")).rejects.toThrow(/own role/);
    expect((await setRole(db, naman, asha.id, "staff")).role).toBe("staff");
  });
});

describe("bugs and ideas", () => {
  it("reach every admin at once, and the reporter hears when it's done", async () => {
    process.env.BOOTSTRAP_ADMINS = "naman";
    const db = await testDb();
    const naman = await person(db, "Naman");
    const asha = await person(db, "Asha");
    const n = notifier();
    const r = await fileReport(db, n, asha, { kind: "bug", text: "The <map> froze", source: "web", page: "/home" }, T0);
    expect(n.dms).toHaveLength(1);
    expect(n.dms[0].to).toBe(naman.telegramId);
    expect(n.dms[0].text).toContain("&lt;map&gt;"); // escaped
    await expect(setReportStatus(db, n, asha, r.id, "done", T0)).rejects.toThrow(GameError);
    await setReportStatus(db, n, naman, r.id, "done", T0);
    expect(n.dms.at(-1)!.to).toBe(asha.telegramId);
    expect(n.dms.at(-1)!.text).toContain("fixed");
    for (let i = 0; i < 9; i++) await fileReport(db, n, asha, { kind: "feature", text: `idea ${i}`, source: "web" }, at(i));
    await expect(fileReport(db, n, asha, { kind: "feature", text: "one more", source: "web" }, at(10))).rejects.toThrow(/a lot/);
  });

  it("the bot takes /bug, /error, /feature request …, and a bare /bug then the next message", async () => {
    process.env.BOOTSTRAP_ADMINS = "boss";
    const db = await testDb();
    const tg = fakeTelegram();
    const n = notifier();
    const ctx: Ctx = { db, call: tg.call, n, now: T0 };
    await handleUpdate(ctx, msg(9, "/start", "boss"));
    await handleUpdate(ctx, msg(1, "/bug the map is blank")); // not signed up yet: still works
    await handleUpdate(ctx, msg(1, "/error kaju went missing"));
    await handleUpdate(ctx, msg(1, "/feature request dark mode"));
    await handleUpdate(ctx, msg(1, "/bug"));
    expect(tg.texts().at(-1)).toContain("What went wrong");
    await handleUpdate(ctx, msg(1, "buttons too small"));
    await handleUpdate(ctx, msg(1, "/start feature"));
    await handleUpdate(ctx, msg(1, "group rides to dinner"));
    const all = (await listReports(db)).map(({ r }) => `${r.kind}:${r.text}`).sort();
    expect(all).toEqual(["bug:buttons too small", "bug:kaju went missing", "bug:the map is blank", "feature:dark mode", "feature:group rides to dinner"]);
    const boss = (await getByTelegram(db, 9))!;
    expect(n.dms.filter((m) => m.to === boss.telegramId)).toHaveLength(5);
    expect(tg.texts().at(-1)).toContain("idea #5");
  });
});

describe("places", () => {
  it("anyone can add a place; same name or a pin next door reuses it; admins rename and hide", async () => {
    process.env.BOOTSTRAP_ADMINS = "naman";
    const db = await testDb();
    const naman = await person(db, "Naman");
    const asha = await person(db, "Asha");
    const a = await findOrAddPlace(db, asha, "Banyan  Stay", null);
    expect(a).toMatchObject({ added: true, place: { id: "banyan-stay", name: "Banyan Stay" } });
    expect((await findOrAddPlace(db, asha, "banyan stay", null)).added).toBe(false);
    // a pin 50 m from Riva is Riva
    expect((await findOrAddPlace(db, asha, "Riva gate", { lat: 15.67155, lng: 73.7104 })).place.id).toBe("riva");
    // first pin for a name-only place sticks
    await findOrAddPlace(db, asha, "Banyan Stay", { lat: 15.666, lng: 73.712 });
    expect(placeById("banyan-stay")?.lat).toBe(15.666);
    await expect(savePlace(db, asha, "banyan-stay", { hidden: true })).rejects.toThrow(GameError);
    await savePlace(db, naman, "community-dinner", { note: "Riva lawn, 7:30pm", lat: 15.6712, lng: 73.7106 });
    expect(placeById("community-dinner")).toMatchObject({ note: "Riva lawn, 7:30pm", lat: 15.6712 });
    expect(samePlace("community-dinner", "riva")).toBe(true);
    expect(parsePin("https://maps.google.com/?q=15.6712,73.7106")).toEqual({ lat: 15.6712, lng: 73.7106 });
  });

  it("an offer to a stay next to Riva matches a request to Riva", async () => {
    const db = await testDb();
    const n = notifier();
    const pilot = await person(db, "Pia", "scooty");
    const hitcher = await person(db, "Hal");
    const stay = await findOrAddPlace(db, pilot, "Sunset stay", { lat: 15.6735, lng: 73.7108 }); // ~260 m from Riva
    expect(stay.added).toBe(true);
    await createPlan(db, n, pilot, { kind: "offer", fromPlace: "circle", toPlace: stay.place.id, departAt: at(120) }, T0);
    const r = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "circle", toPlace: "riva", departAt: at(130) }, T0);
    expect(r.pinged).toBe(1);
  });

  it("errands go to floaters near the start, and can't be offered", async () => {
    const db = await testDb();
    const n = notifier();
    const floater = await person(db, "Flo", "scooty");
    const hitcher = await person(db, "Hal");
    await locate(db, n, floater, { lat: 15.6712, lng: 73.7106, livePeriod: 3600 }, T0); // at Riva
    const r = await createPlan(db, n, hitcher, { kind: "request", fromPlace: "riva", toPlace: "errand", departAt: at(10), note: "pharmacy" }, T0);
    expect(r.pinged).toBe(1);
    const ping = n.dms.find((m) => m.to === floater.telegramId && m.buttons?.[0][0].data?.startsWith("take:"));
    expect(ping!.text).toContain("errand");
    expect(ping!.text).toContain("pharmacy");
    await expect(createPlan(db, n, floater, { kind: "offer", fromPlace: "riva", toPlace: "errand", departAt: at(30) }, T0)).rejects.toThrow(/Errands/);
  });

  it("the bot: somewhere else → type a name → drop a pin → plan; and the errand flow", async () => {
    const db = await testDb();
    const tg = fakeTelegram();
    const n = notifier();
    const ctx: Ctx = { db, call: tg.call, n, now: T0 };
    await handleUpdate(ctx, msg(1, "/start"));
    await handleUpdate(ctx, tap(1, "veh:none"));
    await handleUpdate(ctx, msg(1, "/ride"));
    expect(tg.buttons()).toContain("w:to:errand");
    expect(tg.buttons()).toContain("w:to:+new");
    await handleUpdate(ctx, tap(1, "w:to:+new"));
    await handleUpdate(ctx, msg(1, "Coco Shack"));
    expect(tg.texts().at(-1)).toContain("new on Pillion");
    await handleUpdate(ctx, pin(1, 15.6602, 73.712)); // a pin, not a float
    expect(placeById("coco-shack")?.lat).toBe(15.6602);
    expect(tg.texts().at(-1)).toContain("Starting from");
    await handleUpdate(ctx, tap(1, "w:from:riva"));
    await handleUpdate(ctx, tap(1, "w:t:180"));
    expect(tg.texts().at(-1)).toContain("Coco Shack");

    await handleUpdate(ctx, msg(1, "/ride"));
    await handleUpdate(ctx, tap(1, "w:to:errand"));
    await handleUpdate(ctx, msg(1, "ATM"));
    await handleUpdate(ctx, tap(1, "w:from:circle"));
    await handleUpdate(ctx, tap(1, "w:t:0"));
    expect(tg.texts().at(-1)).toContain("quick errand and back (ATM)");
  });
});

describe("GIF moments", () => {
  it("welcome, matched and ride-done carry a GIF; a refused GIF still sends the words", async () => {
    const db = await testDb();
    const tg = fakeTelegram();
    const n = notifier();
    await handleUpdate({ db, call: tg.call, n, now: T0 }, msg(1, "/start"));
    expect(tg.calls.find((c) => c.method === "sendAnimation")?.params.animation).toMatch(/\/gifs\/welcome\.gif$/);

    const pilot = await person(db, "Pia", "scooty");
    const hitcher = await person(db, "Hal");
    const offer = await createPlan(db, n, pilot, { kind: "offer", fromPlace: "circle", toPlace: "riva", departAt: at(30) }, T0);
    const { hopOn, confirmRide } = await import("@/services/rides");
    const ride = await hopOn(db, n, hitcher, offer.plan.id, at(1));
    expect(n.dms.filter((m) => m.animation?.endsWith("/gifs/matched.gif")).map((m) => m.to).sort()).toEqual([pilot.telegramId, hitcher.telegramId].sort());
    await confirmRide(db, n, hitcher, ride.id, true, at(60));
    expect(n.dms.filter((m) => m.animation?.endsWith("/gifs/kaju.gif"))).toHaveLength(2);

    const { send } = await import("@/bot/telegram");
    const calls: string[] = [];
    const flaky = (async (method: string) => { calls.push(method); if (method === "sendAnimation") throw new Error("bad file"); return {}; }) as Ctx["call"];
    await send(flaky, 5, "hello", { animation: "https://x/gifs/kaju.gif" });
    expect(calls).toEqual(["sendAnimation", "sendMessage"]);
  });
});

describe("merging places", () => {
  it("moves plans and rides, keeps the old name leading to the new place, follows chains, admins only", async () => {
    process.env.BOOTSTRAP_ADMINS = "naman";
    const db = await testDb();
    const n = notifier();
    const naman = await person(db, "Naman");
    const asha = await person(db, "Asha", "scooty");
    const { mergePlace } = await import("@/services/places");
    const { allPlaces } = await import("@/lib/places");
    const a = (await findOrAddPlace(db, asha, "Banyan Tree", null)).place;
    const b = (await findOrAddPlace(db, asha, "Banyan stay", { lat: 15.666, lng: 73.712 })).place;
    const c = (await findOrAddPlace(db, asha, "Banyan homestay", null)).place;
    const p = await createPlan(db, n, asha, { kind: "offer", fromPlace: "riva", toPlace: a.id, departAt: at(60) }, T0);
    await expect(mergePlace(db, asha, a.id, b.id)).rejects.toThrow(GameError);
    expect((await mergePlace(db, naman, a.id, b.id)).moved).toBe(1);
    const { plans } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect((await db.select().from(plans).where(eq(plans.id, p.plan.id)))[0].toPlace).toBe(b.id);
    expect(allPlaces().some((x) => x.id === a.id)).toBe(false);
    expect((await findOrAddPlace(db, asha, "banyan tree", null)).place.id).toBe(b.id); // old name → new place
    await expect(mergePlace(db, naman, c.id, a.id)).rejects.toThrow(/merged away/);
    await mergePlace(db, naman, b.id, c.id); // b (and a, through b) now lead to c
    expect((await findOrAddPlace(db, asha, "Banyan Tree", null)).place.id).toBe(c.id);
    expect(placeById(c.id)?.lat).toBe(15.666); // c had no pin: it takes b's
  });
});
