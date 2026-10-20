import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { makeDb, type Db } from "@/db";
import { memoryNotifier } from "@/bot/telegram";
import { upsertTelegramUser, updateUser } from "@/services/users";
import { resetPlaces } from "@/services/places";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Local throwaway Postgres only (see CLAUDE.md). Never a remote DB.
export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:test@127.0.0.1:5549/pillion_test";

let db: Db | null = null;
export async function testDb() {
  if (!db) {
    db = makeDb(TEST_URL);
    await migrate(db, { migrationsFolder: "drizzle" });
  }
  await db.execute(sql`truncate users, login_codes, plans, rides, floats, kaju, hearts, sent_keys, places, reports, invites, announcements, edge_events restart identity cascade`);
  resetPlaces();
  return db;
}

let tg = 1000;
/** A villager who signed up three days before T0 (so not a brand-new account). Pass `signedUp: false` for someone who
 *  has only said hi to the bot. */
export async function person(db: Db, name: string, vehicle: "scooty" | "car" | "none" = "none", opts: { signedUp?: boolean } = {}) {
  const { user } = await upsertTelegramUser(db, { id: ++tg, first_name: name, username: name.toLowerCase() });
  const u = await updateUser(db, user.id, { vehicle, seats: vehicle === "none" ? 0 : 1 });
  if (opts.signedUp === false) return u;
  const [done] = await db.update(users).set({ onboardedAt: new Date(T0.getTime() - 3 * 86400_000) }).where(eq(users.id, u.id)).returning();
  return done;
}

export const notifier = memoryNotifier;
// 2026-10-17 10:00 IST
export const T0 = new Date("2026-10-17T04:30:00Z");
export const at = (min: number) => new Date(T0.getTime() + min * 60_000);
