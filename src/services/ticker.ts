import { and, eq, gt, gte, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { rides, users } from "@/db/schema";
import { esc, gifUrl, type Notifier } from "@/bot/telegram";
import { LINES, pick } from "@/bot/lines";
import { placeName } from "@/lib/places";
import { istDay, istDayStart, istHHMM, istMinuteOfDay } from "@/lib/time";
import { checkQuietFloats, closeExpiredFloats, resolvePings } from "./floats";
import { expireRides } from "./rides";
import { expirePlans } from "./plans";
import { loadPlaces } from "./places";
import { awardWinners, computeWinners, namesFor, PRIZE_KAJU, PRIZES } from "./prizes";

export { once } from "./once";
import { once } from "./once";

export async function tick(db: Db, n: Notifier, now: Date) {
  await loadPlaces(db);
  await resolvePings(db, n, now);
  await checkQuietFloats(db, n, now);
  await closeExpiredFloats(db, n, now);
  await expirePlans(db, now);
  await expireRides(db, now);

  // 15 min heads-up for matched rides
  // (not for rides matched in the last 5 minutes: they've only just heard about it)
  const soon = await db.select().from(rides).where(and(eq(rides.status, "matched"), gt(rides.departAt, now), lt(rides.departAt, new Date(now.getTime() + 15 * 60_000)), lt(rides.createdAt, new Date(now.getTime() - 5 * 60_000))));
  for (const r of soon) {
    if (!(await once(db, `remind:${r.id}`))) continue;
    for (const uid of [r.pilotId, r.hitcherId]) {
      const [u] = await db.select().from(users).where(eq(users.id, uid));
      await n.dm({ to: u.telegramId, text: `⏰ Ride to <b>${placeName(r.toPlace)}</b> around <b>${istHHMM(r.departAt)}</b>. Helmet check!` });
    }
  }

  // did it happen? (20 min after departure, up to a day back)
  const due = await db.select().from(rides).where(and(eq(rides.status, "matched"), lt(rides.departAt, new Date(now.getTime() - 20 * 60_000)), gte(rides.departAt, new Date(now.getTime() - 24 * 3600_000))));
  for (const r of due) {
    if (!(await once(db, `ask:${r.id}`))) continue;
    for (const uid of [r.pilotId, r.hitcherId]) {
      const [u] = await db.select().from(users).where(eq(users.id, uid));
      await n.dm({
        to: u.telegramId,
        text: `Did the ${istHHMM(r.departAt)} ride to <b>${placeName(r.toPlace)}</b> happen? One yes pays you both.`,
        buttons: [[{ text: "✅ We rode!", data: `done:${r.id}:y` }, { text: "❌ It didn't happen", data: `done:${r.id}:n` }]],
      });
    }
  }

  const minute = istMinuteOfDay(now);
  const day = istDay(now);
  if (minute >= 8 * 60 && minute < 8 * 60 + 30 && (await once(db, `morning:${day}`))) await n.announce(pick(LINES.morning, {}));
  if (minute >= 21 * 60 && (await once(db, `prizes:${day}`))) await postPrizes(db, n, day, now);
}

export async function postPrizes(db: Db, n: Notifier, day: string, now: Date) {
  const winners = await computeWinners(db, day);
  await awardWinners(db, day, winners, now);
  const names = await namesFor(db, winners.flatMap((w) => w.userIds));
  const start = istDayStart(now);
  const doneToday = await db.select().from(rides).where(and(eq(rides.status, "done"), gte(rides.departAt, start)));
  const riders = new Set(doneToday.flatMap((r) => [r.pilotId, r.hitcherId])).size;
  const lines = winners.map((w) => `🏅 <b>${PRIZES[w.prize].title}</b>: ${w.userIds.map((id) => esc(names.get(id) ?? "?")).join(", ")}`);
  if (!lines.length) return;
  await n.announce(`${pick(LINES.dailyIntro, { riders, rides: doneToday.length })}\n\n${lines.join("\n")}\n\nEach winner gets +${PRIZE_KAJU} kaju.`, gifUrl("prizes"));
}
