import { afterEach, describe, expect, it } from "vitest";
import { handleUpdate, type Ctx, type Update } from "@/bot/handle";
import { dailyDigest, SIGNUP_ALERTS_PER_DAY } from "@/services/admin-alerts";
import { createPlan } from "@/services/plans";
import { tick } from "@/services/ticker";
import { at, notifier, person, T0, testDb } from "./helpers";

afterEach(() => { delete process.env.BOOTSTRAP_ADMINS; });
const call = (async (m: string) => (m === "getChatMember" ? { status: "member" } : {})) as Ctx["call"];
const msg = (id: number, text: string): Update => ({ message: { chat: { id, type: "private" }, from: { id, first_name: `P${id}`, username: `p${id}` }, text } });
const tap = (id: number, data: string): Update => ({ callback_query: { id: "q", from: { id, first_name: `P${id}` }, data, message: { chat: { id }, message_id: 1 } } });

describe("admins hear about sign-ups", () => {
  it("one message per new person (not when they change vehicle later), capped per day", async () => {
    process.env.BOOTSTRAP_ADMINS = "boss";
    const db = await testDb();
    const n = notifier();
    const ctx: Ctx = { db, call, n, now: T0 };
    await handleUpdate(ctx, { message: { chat: { id: 1, type: "private" }, from: { id: 1, first_name: "Boss", username: "boss" }, text: "/start" } });
    await handleUpdate(ctx, tap(1, "veh:scooty"));
    const toBoss = () => n.dms.filter((m) => m.to === 1 && m.text.startsWith("🆕"));
    expect(toBoss()).toHaveLength(0); // admins aren't told about themselves
    await handleUpdate(ctx, msg(2, "/start"));
    await handleUpdate(ctx, tap(2, "veh:car"));
    await handleUpdate(ctx, tap(2, "seats:3"));
    expect(toBoss()).toHaveLength(1);
    expect(toBoss()[0].text).toContain("P2");
    expect(toBoss()[0].text).toContain("car, 3 seats");
    await handleUpdate(ctx, msg(2, "/wheels"));
    await handleUpdate(ctx, tap(2, "veh:scooty"));
    expect(toBoss()).toHaveLength(1); // changing wheels isn't a new sign-up
    for (let i = 0; i < SIGNUP_ALERTS_PER_DAY + 2; i++) {
      await handleUpdate(ctx, msg(100 + i, "/start"));
      await handleUpdate(ctx, tap(100 + i, "veh:none"));
    }
    expect(toBoss()).toHaveLength(SIGNUP_ALERTS_PER_DAY);
  });

  it("the 9pm summary: who joined, what happened, asks nobody took; sent once", async () => {
    process.env.BOOTSTRAP_ADMINS = "boss";
    const db = await testDb();
    const n = notifier();
    const boss = await person(db, "Boss");
    const { finishOnboarding } = await import("@/services/users");
    const asha = await person(db, "Asha", "none", { signedUp: false });
    await finishOnboarding(db, asha.id, T0);
    await createPlan(db, n, asha, { kind: "request", fromPlace: "riva", toPlace: "arambol", departAt: at(30) }, T0);
    await dailyDigest(db, n, at(120));
    const d = n.dms.filter((m) => m.to === boss.telegramId).at(-1)!;
    expect(d.text).toContain("Pillion today");
    expect(d.text).toContain("1 joined: Asha");
    expect(d.text).toContain("1 plans posted");
    expect(d.text).toContain("1 ask nobody took");
    const nine = new Date("2026-10-17T15:31:00Z"); // 21:01 IST
    n.dms.length = 0;
    await tick(db, n, nine);
    await tick(db, n, new Date(nine.getTime() + 60_000));
    expect(n.dms.filter((m) => m.text.includes("Pillion today"))).toHaveLength(1);
  });
});
