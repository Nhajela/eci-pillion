import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users, type User } from "@/db/schema";
import { KAJU } from "@/lib/kaju";
import { award } from "./kaju";
import { applyBootstrap } from "./roles";

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };

export async function upsertTelegramUser(db: Db, tg: TgUser): Promise<{ user: User; isNew: boolean }> {
  const r = await upsertRaw(db, tg);
  return { ...r, user: await applyBootstrap(db, r.user) };
}

async function upsertRaw(db: Db, tg: TgUser): Promise<{ user: User; isNew: boolean }> {
  const [existing] = await db.select().from(users).where(eq(users.telegramId, tg.id));
  if (existing) {
    if (tg.username !== undefined && existing.username !== tg.username) {
      const [u] = await db.update(users).set({ username: tg.username ?? null }).where(eq(users.id, existing.id)).returning();
      return { user: u, isNew: false };
    }
    return { user: existing, isNew: false };
  }
  const name = (tg.first_name || tg.username || "Friend").slice(0, 32);
  const [u] = await db
    .insert(users)
    .values({ telegramId: tg.id, username: tg.username ?? null, name })
    .onConflictDoNothing()
    .returning();
  if (u) return { user: u, isNew: true };
  const [again] = await db.select().from(users).where(eq(users.telegramId, tg.id));
  return { user: again, isNew: false };
}

export async function getUser(db: Db, id: number) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}

export async function getByTelegram(db: Db, telegramId: number) {
  const [u] = await db.select().from(users).where(eq(users.telegramId, telegramId));
  return u ?? null;
}

export async function updateUser(db: Db, id: number, patch: Partial<Pick<User, "name" | "vehicle" | "seats" | "avatar" | "scooty" | "botState">>) {
  const [u] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return u;
}

/** Finish sign-up once: stamps onboarded_at and pays the signup kaju. */
export async function finishOnboarding(db: Db, id: number, now: Date) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!u.onboardedAt) await tx.update(users).set({ onboardedAt: now }).where(eq(users.id, id));
    const got = await award(tx, id, KAJU.signup, "signup", "", now);
    return got;
  });
}

const AVATAR_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
export function validAvatar(s: unknown): s is string {
  return typeof s === "string" && s.length < 60_000 && AVATAR_RE.test(s);
}
export const validColour = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
