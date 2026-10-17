import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { floats, hearts, plans, rides, users } from "@/db/schema";
import { istDayStart, istMinuteOfDay } from "@/lib/time";
import { award } from "./kaju";

export const PRIZE_KAJU = 20;

export const PRIZES = {
  generous: { title: "Most Generous Pilot", line: "Most people carried today." },
  early: { title: "Earliest Bird", line: "Planned furthest ahead, and it happened." },
  float: { title: "Longest Float", line: "Did the least, helped the most." },
  avatar: { title: "Best Avatar", line: "Most hearts on the map today." },
  hero: { title: "Pharmacy Run Hero", line: "Took someone to the market, or gave a ride after 7pm." },
  mystery: { title: "Mystery Kaju", line: "Picked at random from everyone who rode." },
} as const;
export type PrizeKey = keyof typeof PRIZES;
export type Winner = { prize: PrizeKey; userIds: number[] };

/** Everyone with the top score wins (ties share). */
function top(scores: Map<number, number>) {
  let best = 0;
  for (const v of scores.values()) best = Math.max(best, v);
  return best > 0 ? [...scores].filter(([, v]) => v === best).map(([k]) => k) : [];
}
const bump = (m: Map<number, number>, k: number, v = 1) => m.set(k, (m.get(k) ?? 0) + v);

function seeded(day: string, n: number) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h) % n;
}

/** Winners for an IST day (YYYY-MM-DD). Pure read; awarding is separate. */
export async function computeWinners(db: Db, day: string): Promise<Winner[]> {
  const start = istDayStart(new Date(`${day}T12:00:00+05:30`));
  const end = new Date(start.getTime() + 24 * 3600_000);
  const done = await db.select().from(rides).where(and(eq(rides.status, "done"), gte(rides.departAt, start), lt(rides.departAt, end)));
  const out: Winner[] = [];

  const pilots = new Map<number, number>();
  for (const r of done) bump(pilots, r.pilotId);
  out.push({ prize: "generous", userIds: top(pilots) });

  const planIds = done.flatMap((r) => [r.offerId, r.requestId]).filter((x): x is number => x != null);
  const leads = new Map<number, number>();
  if (planIds.length) {
    for (const p of await db.select().from(plans).where(inArray(plans.id, planIds))) leads.set(p.userId, Math.max(leads.get(p.userId) ?? 0, p.leadMinutes));
  }
  out.push({ prize: "early", userIds: top(leads) });

  const fl = new Map<number, number>();
  for (const f of await db.select().from(floats).where(and(gte(floats.startedAt, start), lt(floats.startedAt, end)))) {
    const endAt = f.endedAt ?? f.liveUntil;
    bump(fl, f.userId, Math.max(0, Math.round((endAt.getTime() - f.startedAt.getTime()) / 60_000)));
  }
  out.push({ prize: "float", userIds: top(fl) });

  const hs = new Map<number, number>();
  for (const h of await db.select().from(hearts).where(eq(hearts.day, day))) bump(hs, h.toId);
  out.push({ prize: "avatar", userIds: top(hs) });

  const heroes = [...new Set(done.filter((r) => r.toPlace === "market" || istMinuteOfDay(r.departAt) >= 19 * 60).map((r) => r.pilotId))];
  out.push({ prize: "hero", userIds: heroes });

  const riders = [...new Set(done.flatMap((r) => [r.pilotId, r.hitcherId]))].sort((a, b) => a - b);
  out.push({ prize: "mystery", userIds: riders.length ? [riders[seeded(day, riders.length)]] : [] });

  return out.filter((w) => w.userIds.length);
}

export async function awardWinners(db: Db, day: string, winners: Winner[], now: Date) {
  for (const w of winners) for (const id of w.userIds) await award(db, id, PRIZE_KAJU, "prize", `prize:${day}:${w.prize}`, now);
}

export async function namesFor(db: Db, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
