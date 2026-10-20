import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { makeDb, type Db } from "@/db";
import { memoryNotifier } from "@/bot/telegram";
import { upsertTelegramUser, updateUser } from "@/services/users";
import { resetPlaces } from "@/services/places";

// Local throwaway Postgres only (see CLAUDE.md). Never a remote DB.
export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:test@127.0.0.1:5549/pillion_test";

let db: Db | null = null;
export async function testDb() {
  if (!db) {
    db = makeDb(TEST_URL);
    await migrate(db, { migrationsFolder: "drizzle" });
  }
  await db.execute(sql`truncate users, login_codes, plans, rides, floats, kaju, hearts, sent_keys, places, reports restart identity cascade`);
  resetPlaces();
  return db;
}

let tg = 1000;
export async function person(db: Db, name: string, vehicle: "scooty" | "car" | "none" = "none") {
  const { user } = await upsertTelegramUser(db, { id: ++tg, first_name: name, username: name.toLowerCase() });
  return updateUser(db, user.id, { vehicle, seats: vehicle === "none" ? 0 : 1 });
}

export const notifier = memoryNotifier;
// 2026-10-17 10:00 IST
export const T0 = new Date("2026-10-17T04:30:00Z");
export const at = (min: number) => new Date(T0.getTime() + min * 60_000);
