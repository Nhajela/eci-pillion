import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { followUpAsks } from "@/services/followups";
import { createPlan } from "@/services/plans";
import { at, notifier, person, T0, testDb } from "./helpers";

describe("asks nobody took", () => {
  it("after 10 minutes: pilots a little further, then a capped nudge to people with wheels; once per ask", async () => {
    const db = await testDb();
    const n = notifier();
    const asker = await person(db, "Ben");
    const near = await person(db, "Near", "scooty"); // fits normally: already pinged when the ask went up
    const later = await person(db, "Later", "scooty"); // 70 min apart: only the wider round reaches them
    const idle = await person(db, "Idle", "scooty"); // has wheels, no plan right now, used Pillion this week
    const blocked = await person(db, "Spam", "scooty");
    await db.update(users).set({ role: "blocked" }).where(eq(users.id, blocked.id));
    await createPlan(db, n, idle, { kind: "offer", fromPlace: "riva", toPlace: "siolim", departAt: at(-300) }, at(-400)); // active this week
    await createPlan(db, n, near, { kind: "offer", fromPlace: "circle", toPlace: "arambol", departAt: at(60) }, T0);
    await createPlan(db, n, later, { kind: "offer", fromPlace: "circle", toPlace: "arambol", departAt: at(130) }, T0);
    const ask = await createPlan(db, n, asker, { kind: "request", fromPlace: "circle", toPlace: "arambol", departAt: at(60) }, T0);
    n.dms.length = 0;

    expect(await followUpAsks(db, n, at(5))).toBe(0); // too soon
    await followUpAsks(db, n, at(11));
    const to = (id: number) => n.dms.filter((m) => m.to === id);
    expect(to(near.telegramId)).toHaveLength(0);
    expect(to(later.telegramId)[0].text).toContain("Nobody's taken this one yet");
    expect(to(idle.telegramId)[0].text).toContain("nobody's taken it yet");
    expect(to(idle.telegramId)[0].buttons![0][0].data).toBe(`take:${ask.plan.id}`);
    expect(to(blocked.telegramId)).toHaveLength(0);
    expect(to(asker.telegramId)).toHaveLength(0);
    const before = n.dms.length;
    await followUpAsks(db, n, at(12));
    expect(n.dms.length).toBe(before); // once per ask
  });

  it("nobody gets more than two nudges a day, and none at night", async () => {
    const db = await testDb();
    const n = notifier();
    const idle = await person(db, "Idle", "scooty");
    await createPlan(db, n, idle, { kind: "offer", fromPlace: "riva", toPlace: "siolim", departAt: at(-300) }, at(-400));
    for (let i = 0; i < 3; i++) {
      const a = await person(db, `Asker${i}`);
      await createPlan(db, n, a, { kind: "request", fromPlace: "riva", toPlace: "morjim", departAt: at(60 + i) }, T0);
    }
    n.dms.length = 0;
    await followUpAsks(db, n, at(11));
    expect(n.dms.filter((m) => m.to === idle.telegramId)).toHaveLength(2);
    const night = await testDb();
    const n2 = notifier();
    const a = await person(night, "Owl");
    await person(night, "Rider", "scooty");
    await createPlan(night, n2, a, { kind: "request", fromPlace: "riva", toPlace: "morjim", departAt: new Date("2026-10-17T17:45:00Z") }, new Date("2026-10-17T17:00:00Z"));
    expect(await followUpAsks(night, n2, new Date("2026-10-17T17:20:00Z"))).toBe(0); // 22:50 IST
  });
});
