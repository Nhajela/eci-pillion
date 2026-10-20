import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { invites, rides, users, type User } from "@/db/schema";
import { esc, type Notifier } from "@/bot/telegram";
import { env } from "@/lib/env";
import { KAJU } from "@/lib/kaju";
import { award, earnedToday } from "./kaju";
import { GameError } from "./errors";

// Invites, after the assassins game: invite by @username (one invite per username, ever; first inviter wins), or share
// your personal link. The inviter earns kaju when the friend signs up, and more when they complete their first ride.

const normalise = (raw: string) => raw.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "").toLowerCase();
const USERNAME = /^[a-z0-9_]{4,32}$/;

/** Your personal link: opens the bot and remembers you brought them. */
export async function inviteLink(db: Db, user: User) {
  let code = user.inviteCode;
  if (!code) {
    code = randomBytes(5).toString("base64url").replace(/[-_]/g, "x");
    const [u] = await db.update(users).set({ inviteCode: code }).where(and(eq(users.id, user.id), isNull(users.inviteCode))).returning();
    if (!u) code = (await db.select({ c: users.inviteCode }).from(users).where(eq(users.id, user.id)))[0].c!;
  }
  return `https://t.me/${env.botUsername() || "eci_pillion_bot"}?start=inv_${code}`;
}

/** Invite someone by Telegram @username. Inviting them again just gives you the link back. */
export async function inviteByUsername(db: Db, user: User, raw: string) {
  if (!user.onboardedAt) throw new GameError("Sign up first, then invite friends.");
  const username = normalise(raw);
  if (!USERNAME.test(username)) throw new GameError("That doesn't look like a Telegram username. Try @their_name.");
  if (user.username?.toLowerCase() === username) throw new GameError("That's you! 😄");
  const [already] = await db.select().from(users).where(sql`lower(${users.username}) = ${username} and ${users.onboardedAt} is not null`);
  if (already) throw new GameError(`@${username} is already on Pillion.`);
  const [row] = await db.insert(invites).values({ username, inviterId: user.id }).onConflictDoNothing().returning();
  if (!row) {
    const [existing] = await db.select().from(invites).where(eq(invites.username, username));
    if (existing.inviterId !== user.id) throw new GameError(`Someone already invited @${username}. Invite someone else!`);
  }
  return { username, link: await inviteLink(db, user) };
}

/** /start inv_<code> before sign-up: remember who brought them (first one wins, never yourself). */
export async function noteInviter(db: Db, user: User, code: string) {
  if (user.onboardedAt || user.invitedBy) return null;
  const [inviter] = await db.select().from(users).where(eq(users.inviteCode, code));
  if (!inviter || inviter.id === user.id) return null;
  await db.update(users).set({ invitedBy: inviter.id }).where(and(eq(users.id, user.id), isNull(users.invitedBy)));
  return inviter;
}

/** Right after sign-up: credit whoever brought them (their link, or an @username invite). */
export async function claimInvite(db: Db, n: Notifier, user: User, now: Date) {
  const res = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
    let inviterId = u.invitedBy;
    if (u.username) {
      const [inv] = await tx.select().from(invites).where(and(eq(invites.username, u.username.toLowerCase()), isNull(invites.claimedBy)));
      if (inv) {
        await tx.update(invites).set({ claimedBy: u.id, claimedAt: now }).where(eq(invites.username, inv.username));
        inviterId ??= inv.inviterId;
      }
    }
    if (!inviterId || inviterId === u.id) return null;
    if (!u.invitedBy) await tx.update(users).set({ invitedBy: inviterId }).where(eq(users.id, u.id));
    const today = await earnedToday(tx, inviterId, "invite_join", now);
    if (today.count >= KAJU.inviteJoinsPerDay) return null; // a burst of sign-ups from one person: no more join kaju today
    const got = await award(tx, inviterId, KAJU.inviteJoin, "invite_join", `invite:${u.id}`, now);
    return got ? { inviterId, got } : null;
  });
  if (!res) return null;
  const [inviter] = await db.select().from(users).where(eq(users.id, res.inviterId));
  await n.dm({
    to: inviter.telegramId,
    text: `🎉 <b>${esc(user.name)}</b> joined Pillion with your invite! +${res.got} kaju. When they take their first ride, you get +${KAJU.inviteRide} more.`,
  });
  return res;
}

/** A ride was done: anyone on it whose first ride this is pays their inviter the bigger bonus (once per person). */
export async function inviteFirstRide(db: Db, n: Notifier, people: User[], now: Date) {
  for (const p of people) {
    if (!p.invitedBy) continue;
    if (people.some((o) => o.id === p.invitedBy)) continue; // riding with your own invitee doesn't count (no alt farming)
    const [c] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rides)
      .where(and(eq(rides.status, "done"), or(eq(rides.pilotId, p.id), eq(rides.hitcherId, p.id))));
    if ((c?.n ?? 0) !== 1) continue;
    const got = await award(db, p.invitedBy, KAJU.inviteRide, "invite_ride", `invite-ride:${p.id}`, now);
    if (!got) continue;
    const [inviter] = await db.select().from(users).where(eq(users.id, p.invitedBy));
    await n.dm({ to: inviter.telegramId, text: `🛵 <b>${esc(p.name)}</b>, who you invited, just took their first ride! +${got} kaju. You brought someone to the village.` });
  }
}

/** Who you've invited and how it went. */
export async function myInvites(db: Db, user: User) {
  const [named, friends] = await Promise.all([
    db.select().from(invites).where(eq(invites.inviterId, user.id)).orderBy(desc(invites.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.invitedBy, user.id), isNotNull(users.onboardedAt))),
  ]);
  const ids = friends.map((f) => f.id);
  const done = ids.length
    ? await db.select({ p: rides.pilotId, h: rides.hitcherId }).from(rides).where(and(eq(rides.status, "done"), or(inArray(rides.pilotId, ids), inArray(rides.hitcherId, ids))))
    : [];
  const rode = new Set(done.flatMap((r) => [r.p, r.h]));
  return { waiting: named.filter((i) => !i.claimedBy).map((i) => i.username), joined: friends.map((f) => ({ ...f, rode: rode.has(f.id) })) };
}

/** Share text for Telegram's share sheet. */
export const shareUrl = (link: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on Pillion: spare scooty and car seats around the village. Share rides, earn kaju, help the village get around. 🛵🥜")}`;
