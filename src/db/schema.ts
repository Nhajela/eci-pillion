import { sql } from "drizzle-orm";
import {
  bigint, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  name: text("name").notNull(),
  vehicle: text("vehicle").notNull().default("none"), // scooty | bike | none
  seats: integer("seats").notNull().default(0),
  avatar: text("avatar"), // data:image/png;base64,… (128 px)
  scooty: text("scooty").notNull().default("#7fd1b9"),
  botState: jsonb("bot_state").$type<Record<string, unknown> | null>(),
  onboardedAt: ts("onboarded_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const loginCodes = pgTable("login_codes", {
  code: text("code").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  claimedAt: ts("claimed_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(), // offer | request
    fromPlace: text("from_place").notNull(),
    toPlace: text("to_place").notNull(),
    departAt: ts("depart_at").notNull(),
    leadMinutes: integer("lead_minutes").notNull(),
    seats: integer("seats").notNull().default(1), // offers: seats still free
    status: text("status").notNull().default("open"), // open | full | done | cancelled
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("plans_open").on(t.status, t.departAt)],
);

export const rides = pgTable(
  "rides",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offer_id").references(() => plans.id),
    requestId: integer("request_id").references(() => plans.id),
    pilotId: integer("pilot_id").notNull().references(() => users.id),
    hitcherId: integer("hitcher_id").notNull().references(() => users.id),
    fromPlace: text("from_place").notNull(),
    toPlace: text("to_place").notNull(),
    departAt: ts("depart_at").notNull(),
    viaFloat: boolean("via_float").notNull().default(false),
    status: text("status").notNull().default("matched"), // matched | done | cancelled
    cancelledBy: integer("cancelled_by").references(() => users.id),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("rides_status").on(t.status, t.departAt),
    // one live ride per request
    uniqueIndex("rides_one_per_request").on(t.requestId).where(sql`status <> 'cancelled' and request_id is not null`),
  ],
);

export const floats = pgTable(
  "floats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    liveUntil: ts("live_until").notNull(),
    endedAt: ts("ended_at"),
  },
  (t) => [uniqueIndex("floats_one_active").on(t.userId).where(sql`ended_at is null`)],
);

export const kaju = pgTable(
  "kaju",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    ref: text("ref").notNull().default(""),
    day: text("day").notNull(), // IST YYYY-MM-DD
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kaju_once").on(t.userId, t.reason, t.ref), index("kaju_day").on(t.day)],
);

export const hearts = pgTable(
  "hearts",
  {
    fromId: integer("from_id").notNull().references(() => users.id),
    toId: integer("to_id").notNull().references(() => users.id),
    day: text("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId, t.day] })],
);

/** Scheduled messages already sent (idempotency for the ticker). */
export const sentKeys = pgTable("sent_keys", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type Float = typeof floats.$inferSelect;
