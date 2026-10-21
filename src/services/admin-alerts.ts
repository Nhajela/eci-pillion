import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { places, plans, rides, users, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { env } from "@/lib/env";
import { vehicleEmoji } from "@/lib/kaju";
import { istDay, istDayStart } from "@/lib/time";
import { watchList } from "./dashboard";
import { once } from "./once";
import { admins } from "./roles";

// What admins hear about besides bugs and ideas: each sign-up (the first 20 a day) and a 9pm summary.

export const SIGNUP_ALERTS_PER_DAY = 20;
const dashboardButton = () => [[{ text: "📊 Open the dashboard", url: `${env.origin()}/admin` }]];

async function tellAdmins(db: Db, n: Notifier, text: string, except?: number) {
  for (const a of await admins(db)) if (a.id !== except) await n.dm({ to: a.telegramId, text, buttons: dashboardButton() });
}

/** Someone just finished signing up. After 20 today, they only show up in the evening summary. */
export async function notifySignup(db: Db, n: Notifier, user: User, now: Date) {
  if (user.role === "admin") return false; // you know you joined
  const day = istDay(now);
  let slot = false;
  for (let k = 0; k < SIGNUP_ALERTS_PER_DAY && !slot; k++) slot = await once(db, `signup-alert:${day}:${k}`);
  if (!slot) return false;
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(isNotNull(users.onboardedAt));
  const inviter = u.invitedBy ? (await db.select().from(users).where(eq(users.id, u.invitedBy)))[0] : null;
  const wheels = u.vehicle === "none" ? "🚶 no wheels" : `${vehicleEmoji(u.vehicle)} ${u.vehicle}${u.vehicle === "car" ? `, ${u.seats} seats` : ""}`;
  await tellAdmins(
    db, n,
    `🆕 <b>${esc(u.name)}</b>${u.username ? ` (@${esc(u.username)})` : ""} joined Pillion: ${wheels}${inviter ? `, invited by ${esc(inviter.name)}` : ""}. That's <b>${count.n}</b> people now.`,
    u.id,
  );
  return true;
}

/** The 9pm summary for admins: who joined, what happened, what's waiting, what looks odd. */
export async function dailyDigest(db: Db, n: Notifier, now: Date) {
  const start = istDayStart(now);
  const [joined, [posted], [done], [matched], missed, newPlaces, [total]] = await Promise.all([
    db.select({ name: users.name, vehicle: users.vehicle }).from(users).where(gte(users.onboardedAt, start)),
    db.select({ n: sql<number>`count(*)::int` }).from(plans).where(gte(plans.createdAt, start)),
    db.select({ n: sql<number>`count(*)::int` }).from(rides).where(and(eq(rides.status, "done"), gte(rides.completedAt, start))),
    db.select({ n: sql<number>`count(*)::int` }).from(rides).where(gte(rides.createdAt, start)),
    // asks from today that ended with nobody taking them
    db.select({ id: plans.id }).from(plans).where(and(eq(plans.kind, "request"), gte(plans.createdAt, start), inArray(plans.status, ["expired", "cancelled", "open"]), lt(plans.departAt, now),
      sql`not exists (select 1 from rides r where r.request_id = "plans"."id")`)),
    db.select({ name: places.name }).from(places).where(and(gte(places.createdAt, start), sql`${places.mergedInto} is null`)),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(isNotNull(users.onboardedAt)),
  ]);
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const watch = await watchList(db, now, (id) => names.get(id) ?? "?");
  const lines = [
    `🌙 <b>Pillion today</b> (${istDay(now)})`,
    "",
    `🆕 ${joined.length ? `${joined.length} joined: ${joined.map((j) => `${esc(j.name)} ${j.vehicle === "none" ? "🚶" : vehicleEmoji(j.vehicle)}`).join(", ")}` : "Nobody new joined"} · ${total.n} people in all`,
    `📝 ${posted.n} plans posted · 💞 ${matched.n} matched · 🎉 ${done.n} rides done`,
    `🙋 ${missed.length ? `${missed.length} ask${missed.length > 1 ? "s" : ""} nobody took` : "Every ask got a taker"}`,
    ...(newPlaces.length ? [`📍 New places: ${newPlaces.map((p) => esc(p.name)).join(", ")}`] : []),
    ...(watch.length ? ["", "🚩 <b>Worth a look</b>", ...watch.map((w) => `• ${esc(w)}`)] : []),
  ];
  await tellAdmins(db, n, lines.join("\n"));
}
