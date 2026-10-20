import { describe, expect, it } from "vitest";
import { handleUpdate, type Ctx, type Update } from "@/bot/handle";
import { balance } from "@/services/kaju";
import { inviteByUsername, inviteLink, myInvites } from "@/services/invites";
import { createPlan, GameError } from "@/services/plans";
import { confirmRide, hopOn } from "@/services/rides";
import { leaders, pulse, recentRides } from "@/services/stats";
import { finishOnboarding, getByTelegram } from "@/services/users";
import { at, notifier, person, T0, testDb } from "./helpers";

const fake = () => {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const call = (async (method: string, params: Record<string, unknown>) => { calls.push({ method, params }); return method === "getChatMember" ? { status: "member" } : {}; }) as Ctx["call"];
  return { call, calls };
};
const msg = (id: number, text: string, username?: string): Update => ({ message: { chat: { id, type: "private" }, from: { id, first_name: `P${id}`, username }, text } });
const tap = (id: number, data: string): Update => ({ callback_query: { id: `q${Math.random()}`, from: { id, first_name: `P${id}` }, data, message: { chat: { id }, message_id: 1 } } });

async function rideTogether(db: Awaited<ReturnType<typeof testDb>>, n: ReturnType<typeof notifier>, pilot: Parameters<typeof createPlan>[2], hitcher: Parameters<typeof createPlan>[2], min = 0) {
  const offer = await createPlan(db, n, pilot, { kind: "offer", fromPlace: "circle", toPlace: "riva", departAt: at(min + 30) }, at(min));
  const ride = await hopOn(db, n, hitcher, offer.plan.id, at(min + 1));
  const r = await confirmRide(db, n, hitcher, ride.id, true, at(min + 60));
  // a brand-new account on the ride: the other one has to say it happened too
  return "waiting" in r && r.waiting ? confirmRide(db, n, pilot, ride.id, true, at(min + 61)) : r;
}

describe("invites", () => {
  it("a personal link credits the inviter on sign-up, and more on the friend's first ride (once)", async () => {
    const db = await testDb();
    const tg = fake();
    const n = notifier();
    const fresh = await person(db, "Asha", "scooty");
    await finishOnboarding(db, fresh.id, T0);
    const asha = (await getByTelegram(db, fresh.telegramId))!;
    const link = await inviteLink(db, asha);
    const code = link.split("start=inv_")[1];
    expect(await inviteLink(db, (await getByTelegram(db, asha.telegramId))!)).toBe(link); // stable
    const ctx: Ctx = { db, call: tg.call, n, now: T0 };
    await handleUpdate(ctx, msg(500, `/start inv_${code}`));
    expect(tg.calls.some((c) => String(c.params.text ?? "").includes("invited you"))).toBe(true);
    await handleUpdate(ctx, tap(500, "veh:none"));
    expect(await balance(db, asha.id)).toBe(10 + 10); // her signup + invite_join
    expect(n.dms.some((m) => m.to === asha.telegramId && m.text.includes("joined Pillion with your invite"))).toBe(true);

    const ben = (await getByTelegram(db, 500))!;
    await rideTogether(db, n, asha, ben);
    const after = await balance(db, asha.id);
    expect(n.dms.some((m) => m.to === asha.telegramId && m.text.includes("first ride"))).toBe(true);
    await rideTogether(db, n, asha, ben, 120);
    expect((await balance(db, asha.id)) - after).toBe(10 + 30); // the 2nd ride: plan + pilot kaju only, no invite bonus again
    expect((await myInvites(db, asha)).joined).toEqual([{ id: ben.id, name: "P500", rode: true }]);
  });

  it("an @username invite counts even without the link; one per username; not yourself or someone already in", async () => {
    const db = await testDb();
    const n = notifier();
    const fresh = await person(db, "Asha", "scooty", { signedUp: false });
    await expect(inviteByUsername(db, fresh, "@friend")).rejects.toThrow(GameError); // not signed up yet
    await finishOnboarding(db, fresh.id, T0);
    const asha = (await getByTelegram(db, fresh.telegramId))!;
    const cleo = await person(db, "Cleo");
    await expect(inviteByUsername(db, asha, "@asha")).rejects.toThrow(/you/);
    await finishOnboarding(db, cleo.id, T0);
    await finishOnboarding(db, (await person(db, "Zed")).id, T0);
    await expect(inviteByUsername(db, asha, "cleo")).rejects.toThrow(/already on Pillion/);
    expect((await inviteByUsername(db, asha, "https://t.me/Dev_Goa")).username).toBe("dev_goa");
    await expect(inviteByUsername(db, (await getByTelegram(db, cleo.telegramId))!, "@dev_goa")).rejects.toThrow(/already invited/);
    const tg = fake();
    await handleUpdate({ db, call: tg.call, n, now: T0 }, msg(600, "/start", "Dev_Goa"));
    await handleUpdate({ db, call: tg.call, n, now: T0 }, tap(600, "veh:scooty"));
    expect(n.dms.some((m) => m.to === asha.telegramId && m.text.includes("joined"))).toBe(true);
  });
});

describe("the board", () => {
  it("counts rides, riders and askers, lists the feed and leaders, and celebrates the first ride once", async () => {
    const db = await testDb();
    const n = notifier();
    const asha = await person(db, "Asha", "scooty");
    const ben = await person(db, "Ben");
    await createPlan(db, n, ben, { kind: "request", fromPlace: "riva", toPlace: "arambol", departAt: at(300) }, T0);
    await rideTogether(db, n, asha, ben);
    expect(n.announcements.filter((a) => a.includes("very first Pillion ride"))).toHaveLength(1);
    const p = await pulse(db, at(70));
    expect(p).toMatchObject({ rides: 1, riders: 2, pilots: 1, askers: 1, askingNow: 1, next: 10 });
    expect((await recentRides(db))[0]).toMatchObject({ pilot: { name: "Asha" }, hitcher: { name: "Ben" }, to: "riva" });
    expect((await leaders(db)).pilots[0]).toMatchObject({ name: "Asha", n: 1 });
  });
});

describe("totals per person", () => {
  it("the dashboard, the board's inviters and myInvites count the right person's rows", async () => {
    const db = await testDb();
    const n = notifier();
    const { dashboard } = await import("@/services/dashboard");
    const { award } = await import("@/services/kaju");
    const a = await person(db, "A", "scooty");
    const b = await person(db, "B");
    const c = await person(db, "C");
    for (const u of [a, b, c]) await finishOnboarding(db, u.id, T0); // +10 each
    await award(db, c.id, 7, "prize", "x", T0);
    const d = await dashboard(db, T0);
    expect(Object.fromEntries(d.people.map(({ u, k }) => [u.name, k]))).toEqual({ A: 10, B: 10, C: 17 });
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(users).set({ invitedBy: c.id }).where(eq(users.id, a.id));
    await db.update(users).set({ invitedBy: c.id }).where(eq(users.id, b.id));
    expect((await leaders(db)).inviters).toEqual([expect.objectContaining({ name: "C", n: 2 })]);
    await rideTogether(db, n, (await getByTelegram(db, a.telegramId))!, (await getByTelegram(db, b.telegramId))!);
    const mine = await myInvites(db, c);
    expect(mine.joined.map((j) => j.rode)).toEqual([true, true]);
  });
});
